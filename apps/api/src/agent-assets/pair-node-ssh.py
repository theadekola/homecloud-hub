"""Fixed SSH bootstrap, scoped to one verified Proxmox node. Input is never shell text."""
import ast,base64,fcntl,hashlib,json,os,pathlib,shutil,socket,ssl,subprocess,sys,tempfile,urllib.request,urllib.parse,zlib

def execute(payload,root=pathlib.Path('/'),run=subprocess.run,hostname=socket.gethostname,which=shutil.which,check_url=None):
    if os.geteuid()!=0: raise RuntimeError('root-required')
    if hostname().split('.')[0]!=payload['node']: raise RuntimeError('wrong-node')
    if not all(which(command) for command in ['qm','pct','python3','systemctl']): raise RuntimeError('not-proxmox')
    url=urllib.parse.urlsplit(payload['url'])
    if url.scheme!='https' or not url.hostname or url.username or url.password or url.path not in ('','/') or url.query or url.fragment: raise RuntimeError('invalid-url')
    context=ssl.create_default_context(cadata=payload.get('ca') or None)
    if check_url: check_url(payload['url'],context)
    else:
        with urllib.request.urlopen(payload['url']+'/api/health',context=context,timeout=15) as response:
            if response.status!=200: raise RuntimeError('controller-unreachable')
    config=root/'etc/iclusters-node-agent.json';agent=root/'usr/local/sbin/iclusters-node-agent.py';unit=root/'etc/systemd/system/iclusters-node-agent.service'
    if any(p.exists() or p.is_symlink() for p in [config,agent,unit,root/'etc/homecloud-node-agent.json',root/'etc/systemd/system/homecloud-node-agent.service']): raise RuntimeError('already-installed')
    if payload['mode']=='probe': return {'ready':True,'hostname':payload['node']}
    source=zlib.decompress(base64.b64decode(payload['source'],validate=True))
    if hashlib.sha256(source).hexdigest()!=payload['revision']: raise RuntimeError('source-mismatch')
    compile(ast.parse(source),str(agent),'exec')
    if not payload.get('id') or not payload.get('token'): raise RuntimeError('missing-pairing')
    text='''[Unit]
Description=i-Clusters Proxmox Docker bridge
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/bin/python3 /usr/local/sbin/iclusters-node-agent.py
Restart=always
RestartSec=10
UMask=0077
[Install]
WantedBy=multi-user.target
'''
    lock=root/'run/iclusters-pairing.lock';lock.parent.mkdir(parents=True,exist_ok=True)
    with open(lock,'a') as handle:
        os.chmod(lock,0o600);fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        created=[]
        try:
            for path,content,mode in [(agent,source,0o600),(config,json.dumps({k:payload[k] for k in ['url','id','token','kind','ca'] if k in payload}).encode(),0o600),(unit,text.encode(),0o644)]:
                path.parent.mkdir(parents=True,exist_ok=True)
                fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,mode);created.append(path)
                with os.fdopen(fd,'wb') as file: file.write(content);file.flush();os.fsync(file.fileno())
                os.chmod(path,mode)
            for command in [['systemctl','daemon-reload'],['systemctl','enable','--now','iclusters-node-agent.service']]:
                if run(command,capture_output=True,timeout=30).returncode: raise RuntimeError('service-failed')
            return {'installed':True}
        except Exception:
            if unit in created:
                try: run(['systemctl','disable','--now','iclusters-node-agent.service'],capture_output=True,timeout=30)
                except Exception: pass
            for path in reversed(created): path.unlink(missing_ok=True)
            try: run(['systemctl','daemon-reload'],capture_output=True,timeout=30)
            except Exception: pass
            raise

if __name__=='__main__':
    try: print(json.dumps(execute(json.load(sys.stdin))))
    except Exception as error:
        allowed=['root-required','wrong-node','not-proxmox','invalid-url','already-installed','source-mismatch','missing-pairing','service-failed','controller-unreachable']
        print(json.dumps({'error':str(error) if str(error) in allowed else 'bootstrap-failed'}));sys.exit(1)
