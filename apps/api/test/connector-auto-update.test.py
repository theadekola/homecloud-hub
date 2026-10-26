import ast,base64,hashlib,hmac,importlib.util,json,pathlib,tempfile,time,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('agent',pathlib.Path(__file__).parents[1]/'src/agent-assets/iclusters-node-agent.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class Updates(unittest.TestCase):
 def fixture(self):
  config={'id':'node','token':'pairing-secret','url':'https://controller.test'};source=b'VERSION=9\n';nonce='a'*32
  p={'id':'node','version':9,'revision':hashlib.sha256(source).hexdigest(),'expiresAt':int(time.time()*1000)+30000,'nonce':nonce,'source':base64.b64encode(source).decode()}
  p['signature']=hmac.new(hashlib.sha256(config['token'].encode()).digest(),json.dumps([p['id'],p['version'],p['revision'],p['expiresAt'],nonce],separators=(',',':')).encode(),hashlib.sha256).hexdigest()
  return config,p,nonce
 def test_manifest_binding(self):
  c,p,n=self.fixture();self.assertEqual(a.validate_connector_update(c,p,n),b'VERSION=9\n')
  for change in [{'id':'other'},{'signature':'0'*64},{'source':base64.b64encode(b'VERSION=8').decode()},{'version':8},{'expiresAt':0},{'nonce':'b'*32}]:
   with self.assertRaises(Exception):a.validate_connector_update(c,{**p,**change},n)
  with self.assertRaises(Exception):a.validate_connector_update({**c,'url':'http://controller.test'},p,n)
 def test_watchdog_restores_only_connector_and_honors_verification(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);target=root/'agent.py';config=root/'config.json';config.write_text('{"id":"node"}');old=b'VERSION=8\n';(root/'previous.py').write_bytes(old)
   script=a.ROLLBACK_SOURCE.replace('var/lib/iclusters-connector-update',str(root)).replace('usr/local/sbin/iclusters-node-agent.py',str(target)).replace('etc/iclusters-node-agent.json',str(config))
   for verified in [True,False]:
    target.write_text('VERSION=9\n');state={'nonce':'n','verified':verified,'previousRevision':hashlib.sha256(old).hexdigest(),'configHash':hashlib.sha256(config.read_bytes()).hexdigest()};(root/'pending.json').write_text(json.dumps(state))
    with patch('sys.argv',['rollback','n']),patch.object(a.subprocess,'run') as run:
     try:exec(compile(script,'rollback','exec'),{})
     except SystemExit:pass
     self.assertEqual(target.read_bytes(),b'VERSION=9\n' if verified else old)
     if not verified:self.assertEqual(run.call_args.args[0],['systemctl','restart','iclusters-node-agent.service'])
 def test_install_preserves_pairing_and_arms_watchdog_before_exec(self):
  class Replaced(BaseException):pass
  for fail in [False,True]:
   with tempfile.TemporaryDirectory() as directory:
    root=pathlib.Path(directory)
    for part in ['etc','usr/local/sbin','var/lib','run']:(root/part).mkdir(parents=True,exist_ok=True)
    config,payload,nonce=self.fixture();file=root/'etc/iclusters-node-agent.json';file.write_text(json.dumps(config));target=root/'usr/local/sbin/iclusters-node-agent.py';target.write_bytes(b'VERSION=8\n');before=file.read_bytes();calls=[]
    def execute(*args):calls.append(('exec',args));raise RuntimeError('exec failure') if fail else Replaced()
    with patch.object(a,'__file__',str(target)),patch.object(a.os,'geteuid',return_value=0):
     with self.assertRaises(RuntimeError if fail else Replaced):a.install_connector_update(config,payload,nonce,root,execute,lambda *args,**kw:calls.append(('timer',args)))
    self.assertEqual(file.read_bytes(),before);self.assertEqual(target.read_bytes(),b'VERSION=8\n' if fail else b'VERSION=9\n');self.assertEqual(calls[0][0],'timer');self.assertEqual(calls[0][1][0][0],'systemd-run');self.assertEqual(calls[1][0],'exec')
    state=json.loads((root/'var/lib/iclusters-connector-update/pending.json').read_text());self.assertEqual(state['verified'],fail)
 def test_verification_receipt_is_durable_before_work_resumes(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);config=root/'config.json';config.write_text('{"id":"node"}');state={'nonce':'receipt','revision':a.REVISION,'verified':False,'configHash':hashlib.sha256(config.read_bytes()).hexdigest()};(root/'pending.json').write_text(json.dumps(state))
   with patch.object(a,'AUTO_UPDATE_STATE',root):
    self.assertEqual(a.connector_update_receipt(),(True,''));a.verify_connector_update({},'wrong',config);self.assertEqual(a.connector_update_receipt(),(True,''));a.verify_connector_update({},'receipt',config);self.assertEqual(a.connector_update_receipt(),(False,'receipt'))
 def test_atomic_file_has_private_permissions(self):
  with tempfile.TemporaryDirectory() as d:
   target=pathlib.Path(d)/'agent.py';a.atomic_connector_file(target,b'VERSION=9\n');self.assertEqual(target.stat().st_mode&0o777,0o600)
if __name__=='__main__':unittest.main()
