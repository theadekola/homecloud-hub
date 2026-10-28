import importlib.util,pathlib,tempfile,json,hashlib,zlib,base64,types,stat
path=pathlib.Path(__file__).resolve().parents[1]/'src/agent-assets/pair-node-ssh.py'
spec=importlib.util.spec_from_file_location('pairing_bootstrap',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.os.geteuid=lambda:0
source=b'VERSION=9\nprint("fixture")\n'
payload={'mode':'install','node':'node01','url':'https://controller.test:6002','ca':'','id':'node-id','token':'secret-node-token','kind':'proxmox','source':base64.b64encode(zlib.compress(source)).decode(),'revision':hashlib.sha256(source).hexdigest()}
def test(root,body=payload,fail=False):
 calls=[]
 def run(command,**kwargs):
  calls.append(command);return types.SimpleNamespace(returncode=1 if fail and command[1:]==['enable','--now','iclusters-node-agent.service'] else 0)
 def check(url,context): assert context.check_hostname and context.verify_mode==2
 return module.execute(body,root=root,run=run,hostname=lambda:'node01',which=lambda c:'/usr/bin/'+c,check_url=check),calls
with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp)
 try: test(root,{**payload,'node':'wrong'})
 except RuntimeError as e: assert str(e)=='wrong-node'
 else: raise AssertionError('wrong node accepted')
 assert not (root/'etc').exists()
 result,calls=test(root,{**payload,'mode':'probe'});assert result['ready'] and not (root/'etc').exists()
 result,calls=test(root);assert result['installed'];config=root/'etc/iclusters-node-agent.json';assert json.loads(config.read_text())['token']=='secret-node-token';assert stat.S_IMODE(config.stat().st_mode)==0o600;assert (root/'usr/local/sbin/iclusters-node-agent.py').read_bytes()==source
 assert all(c[0]=='systemctl' for c in calls)
 try: test(root)
 except RuntimeError as e: assert str(e)=='already-installed'
 else: raise AssertionError('overwrote existing connector')
with tempfile.TemporaryDirectory() as temp:
 root=pathlib.Path(temp)
 try: test(root,fail=True)
 except RuntimeError as e: assert str(e)=='service-failed'
 else: raise AssertionError('failed service accepted')
 assert not (root/'etc/iclusters-node-agent.json').exists();assert not (root/'usr/local/sbin/iclusters-node-agent.py').exists()
print('Remote bootstrap fixture passed')
