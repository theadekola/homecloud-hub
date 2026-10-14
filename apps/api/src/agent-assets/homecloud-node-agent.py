#!/usr/bin/env python3
"""HomeCloud outbound connector for Proxmox nodes or standalone Docker hosts."""
import argparse,sys,base64,json,os,re,shlex,socket,subprocess,threading,time,urllib.request,queue,pathlib,uuid,ipaddress
VERSION=3
HOSTS=[]
RESCAN=threading.Event()
LOCK=threading.Lock()
def run(args,timeout=320,input_data=None):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout,input=input_data)
 if p.returncode: raise RuntimeError((p.stderr or p.stdout or 'Command failed')[-400:])
 return p.stdout

def guest_run(identity,script,timeout=320):
 if not re.fullmatch(r'node|(?:lxc|qemu)/[0-9]+',identity):raise RuntimeError('Invalid guest identity')
 if len(script.encode())>1000000:raise RuntimeError('Guest request too large')
 if globals().get('CONFIG',{}).get('kind')=='docker' and identity!='node':raise RuntimeError('Standalone connector cannot access Proxmox guests')
 if identity=='node':return run(['/bin/sh','-c',script],timeout=timeout)
 kind,vmid=identity.split('/')
 if kind=='lxc':return run(['pct','exec',vmid,'--','/bin/sh','-c',script],timeout=timeout)
 result=json.loads(run(['qm','guest','exec',vmid,'--synchronous','1','--timeout',str(timeout-10),'--pass-stdin','1','--','/bin/sh'],input_data=script,timeout=timeout))
 if not result.get('exited') or result.get('exitcode')!=0 or result.get('out-truncated'):raise RuntimeError(result.get('err-data') or 'Guest command incomplete; verify running QEMU agent and guest curl')
 return result.get('out-data','')

def docker_request(host,path,method='GET',body='',timeout=300):
 if not re.match(r'^/(info|version|containers|images|networks|volumes|system|events|build)([/?]|$)',path) or '\n' in path:raise RuntimeError('Invalid Docker path')
 if method not in ('GET','POST','DELETE'):raise RuntimeError('Invalid Docker method')
 decoded=base64.b64decode(body,validate=True) if body else b''
 if len(decoded)>1024*1024:raise RuntimeError('Request too large')
 content='application/x-tar' if path.startswith('/build?') else 'application/json'
 command='curl --silent --show-error --max-time '+str(int(timeout))+' --unix-socket /var/run/docker.sock -X '+shlex.quote(method)+' -H '+shlex.quote('Content-Type: '+content)+' --write-out '+shlex.quote('\n__HOMECLOUD_STATUS__%{http_code}')+' '+shlex.quote('http://localhost'+path)
 if body:command="printf %s "+shlex.quote(body)+" | base64 -d | "+command+' --data-binary @-'
 # Encode binary Docker log frames before they pass through the guest-agent JSON channel.
 script='command -v curl >/dev/null || { echo "Guest curl is missing" >&2; exit 1; }; test -S /var/run/docker.sock || { echo "Docker socket unavailable; install or start Docker" >&2; exit 1; }; ('+command+') | base64'
 output=guest_run(host,script).strip()
 try:
  data=base64.b64decode(output);payload,status=data.rsplit(b'\n__HOMECLOUD_STATUS__',1)
 except Exception:raise RuntimeError('Guest returned an invalid Docker response; check curl and Docker service')
 if status==b'000':raise RuntimeError('Docker socket is not responding; start Docker service')
 if len(payload)>1300000:raise RuntimeError('Response too large for node bridge')
 return {'status':int(status),'body':base64.b64encode(payload).decode()}

def setup_guest(identity):
 if not re.fullmatch(r'(?:lxc|qemu)/[0-9]+',identity):raise RuntimeError('Setup is allowed only inside guests')
 os_id=guest_run(identity,'. /etc/os-release; printf "%s" "$ID"',timeout=30).strip()
 if os_id not in ('debian','ubuntu'):raise RuntimeError('Automatic setup supports Debian and Ubuntu guests only')
 if identity.startswith('lxc/'):
  vmid=identity.split('/')[1];config=run(['pct','config',vmid],30)
  features=next((line.split(':',1)[1].strip() for line in config.splitlines() if line.startswith('features:')),'')
  parts=[part for part in features.split(',') if part and not part.startswith('nesting=')];parts.append('nesting=1')
  run(['pct','set',vmid,'--features',','.join(parts)],30)
 script=post(CONFIG,'setup-script',{})['script']
 try:guest_run(identity,script,timeout=900)
 except Exception as e:
  message=str(e)
  if identity.startswith('lxc/'):message+='; CT nesting was enabled. If Docker cannot start, restart this CT in Proxmox and retry.'
  raise RuntimeError(message)
 finally:RESCAN.set()
 return {'status':200,'body':base64.b64encode(json.dumps({'message':'Docker installed, started and verified. Discovery is refreshing.'}).encode()).decode()}

def scan():
 global HOSTS
 while True:
  found=[]
  candidates=[('node',socket.gethostname())]
  for tool,kind in ([] if globals().get('CONFIG',{}).get('kind')=='docker' else [('qm','qemu'),('pct','lxc')]):
   try:
    for line in run([tool,'list'],30).splitlines()[1:]:
     fields=line.split()
     if len(fields)>2 and fields[0].isdigit():
      # qm: VMID NAME STATUS; pct: VMID STATUS LOCK NAME
      running=fields[2]=='running' if tool=='qm' else fields[1]=='running'
      if running:candidates.append((kind+'/'+fields[0],fields[1] if tool=='qm' else fields[-1]))
   except Exception as e:print('Guest list unavailable: '+str(e),flush=True)
  for identity,name in candidates:
   try:
    r=docker_request(identity,'/info',timeout=8)
    if r['status']!=200:raise RuntimeError('Docker Engine returned HTTP '+str(r['status']))
    info=json.loads(base64.b64decode(r['body']))
    if r['status']!=200 or not info.get('ServerVersion'):raise RuntimeError('Docker Engine not available')
    found.append({'id':identity,'name':name,'online':True,'status':'connected','setup':False})
   except Exception as e:
    error=str(e)[:400];supported=False
    if identity!='node':
     try:supported=guest_run(identity,'. /etc/os-release; printf "%s" "$ID"',timeout=30).strip() in ('debian','ubuntu')
     except Exception:pass
    found.append({'id':identity,'name':name,'online':False,'error':error,'setup':supported,'status':'setup_available' if supported else 'guest_access_required'})
   with LOCK:HOSTS=list(found)
  RESCAN.wait(60);RESCAN.clear()

# Local read-only network collection is separate from guest Docker discovery.
NETWORK=None
NETWORK_SESSION=str(uuid.uuid4())
def collect_network(root='/sys/class/net',boot_path='/proc/sys/kernel/random/boot_id'):
 boot=NETWORK_SESSION
 try:boot=pathlib.Path(boot_path).read_text().strip()
 except OSError:pass
 entries=json.loads(run(['ip','-j','address','show'],timeout=3))
 if not isinstance(entries,list) or len(entries)>512:raise RuntimeError('Invalid interface inventory')
 rows=[]
 for entry in entries:
  name=entry.get('ifname','')
  if name in ('.','..') or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,15}',name):continue
  base=pathlib.Path(root)/name
  def read_int(path):
   try:return int((base/path).read_text().strip())
   except (OSError,ValueError):return None
  addresses=[]
  for address in entry.get('addr_info',[]):
   try:
    ip=ipaddress.ip_address(address['local']);prefix=address['prefixlen']
    if isinstance(prefix,int) and 0<=prefix<=(32 if ip.version==4 else 128):addresses.append(str(ip)+'/'+str(prefix))
   except (KeyError,ValueError,TypeError):pass
  speed=None;reason='unavailable'
  if not (base/'device').exists():reason='virtual'
  else:
   speed=read_int('speed')
   if speed is None or speed<=0:
    speed=None;reason='link-down' if entry.get('operstate') in ('DOWN','LOWERLAYERDOWN') else 'unsupported'
  rx=read_int('statistics/rx_bytes');tx=read_int('statistics/tx_bytes')
  rows.append({'name':name,'ifindex':entry.get('ifindex'),'mac':entry.get('address'),'addresses':addresses[:64],'speed':speed,'speedReason':reason,'rxBytes':str(rx) if rx is not None and rx>=0 else None,'txBytes':str(tx) if tx is not None and tx>=0 else None})
 return {'status':'ok','bootId':boot,'uptime':time.monotonic(),'interfaces':rows}
def network_scan():
 global NETWORK
 while True:
  try:report=collect_network()
  except Exception:report={'status':'error'}
  with LOCK:NETWORK=report
  time.sleep(5)

def post(config,path,body):
 request=urllib.request.Request(config['url']+'/api/node-agent/'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+config.get('token','')})
 with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)

def main():
 global CONFIG
 parser=argparse.ArgumentParser();parser.add_argument('--pair');parser.add_argument('--pair-stdin',action='store_true');parser.add_argument('--kind',choices=['proxmox','docker'],default='proxmox');parser.add_argument('--url');parser.add_argument('--config',default='/etc/homecloud-node-agent.json');args=parser.parse_args()
 if args.pair_stdin:
  args.pair=sys.stdin.readline().strip()
  if not args.pair:raise SystemExit('Pairing code is required')
 if args.pair:
  if os.path.exists(args.config):raise SystemExit('Connector already configured. Revoke and remove the old connector before pairing again.')
  if not args.url or not args.url.startswith('https://'):raise SystemExit('HomeCloud HTTPS URL is required')
  config={'url':args.url.rstrip('/')};config.update(post(config,'pair',{'code':args.pair,'name':socket.gethostname(),'kind':args.kind}))
  fd=os.open(args.config,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w') as f:json.dump(config,f)
  os.chmod(args.config,0o600);return
 with open(args.config) as f:config=json.load(f)
 CONFIG=config
 threading.Thread(target=scan,daemon=True).start();threading.Thread(target=network_scan,daemon=True).start();results=[];pending=queue.Queue();completed=queue.Queue()
 def worker():
  while True:
   job=pending.get()
   if job.get('expiresAt',time.time()*1000+1)<time.time()*1000:
    completed.put({'id':job['id'],'error':'Request expired before execution'});continue
   try:result=setup_guest(job['host']) if job.get('operation')=='setup' else docker_request(job['host'],job['path'],job['method'],job['body'])
   except Exception as e:result={'error':str(e)[:400]}
   completed.put({'id':job['id'],**result})
 threading.Thread(target=worker,daemon=True).start()
 while True:
  try:
   with LOCK:hosts=list(HOSTS);network=NETWORK
   response=post(config,'poll',{'version':VERSION,'hosts':hosts,'results':results,**({'network':network} if network else {})});results=[]
   for job in response['jobs']:pending.put(job)
   while not completed.empty():results.append(completed.get())
  except Exception as e:print('Node agent connection unavailable: '+str(e),flush=True)
  time.sleep(2)
if __name__=='__main__':main()
