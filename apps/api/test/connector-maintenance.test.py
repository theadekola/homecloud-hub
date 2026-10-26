import ast,base64,hashlib,importlib.util,json,pathlib,tempfile,unittest
from unittest.mock import patch
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('maintenance',pathlib.Path(__file__).parents[1]/'src/agent-assets/update-connector.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Maintenance(unittest.TestCase):
 def fixture(self,fail=False):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);root=pathlib.Path(tmp.name)
  for p in ['etc','usr/local/sbin','run','var/backups']:(root/p).mkdir(parents=True,exist_ok=True)
  config=root/'etc/iclusters-node-agent.json';config.write_text(json.dumps({'id':'paired','token':'secret','url':'https://iclusters.test'}));config.chmod(0o600)
  agent=root/'usr/local/sbin/iclusters-node-agent.py';agent.write_text('VERSION=4\n');calls=[]
  def run(args,**kwargs):calls.append(args);return SimpleNamespace(returncode=1 if fail else 0)
  source=b'VERSION=5\n';payload={'id':'paired','tokenHash':hashlib.sha256(b'secret').hexdigest(),'source':base64.b64encode(source).decode(),'revision':hashlib.sha256(source).hexdigest(),'version':5}
  return root,config,agent,calls,run,payload
 def test_success(self):
  root,config,agent,calls,run,payload=self.fixture();before=config.read_bytes()
  with patch.object(m.os,'geteuid',return_value=0),patch.object(m.time,'sleep'):result=m.update(payload,root,run)
  self.assertTrue(result['installed']);self.assertEqual(agent.read_text(),'VERSION=5\n');self.assertEqual(config.read_bytes(),before);self.assertEqual(config.stat().st_mode&0o777,0o600)
  self.assertTrue(all(c[0]=='systemctl' and c[-1]=='iclusters-node-agent.service' for c in calls));backup=root/result['backup'];self.assertEqual((backup/'config.json').stat().st_mode&0o777,0o600);self.assertEqual(backup.stat().st_mode&0o777,0o700)
 def test_utf8_source_checks_checksum_before_installing(self):
  for tamper in [False,True]:
   root,config,agent,calls,run,payload=self.fixture();payload['sourceEncoding']='utf8';payload['source']='VERSION=5\n';before=config.read_bytes()
   if tamper:payload['source']+='tampered=True\n'
   with patch.object(m.os,'geteuid',return_value=0),patch.object(m.time,'sleep'):
    if tamper:
     with self.assertRaisesRegex(RuntimeError,'checksum'):m.update(payload,root,run)
     self.assertEqual(calls,[]);self.assertEqual(agent.read_text(),'VERSION=4\n')
    else:self.assertTrue(m.update(payload,root,run)['installed']);self.assertEqual(agent.read_text(),'VERSION=5\n')
   self.assertEqual(config.read_bytes(),before)
 def test_wrong_pair_and_checksum_never_restart(self):
  for change in [{'id':'other'},{'tokenHash':'0'*64},{'revision':'0'*64},{'version':6}]:
   root,config,agent,calls,run,payload=self.fixture();payload.update(change)
   with patch.object(m.os,'geteuid',return_value=0),self.assertRaises(RuntimeError):m.update(payload,root,run)
   self.assertEqual(calls,[]);self.assertEqual(agent.read_text(),'VERSION=4\n')
 def test_newer_connector_never_downgraded(self):
  root,config,agent,calls,run,payload=self.fixture();agent.write_text('VERSION=6\n')
  with patch.object(m.os,'geteuid',return_value=0),self.assertRaisesRegex(RuntimeError,'newer connector'):m.update(payload,root,run)
  self.assertEqual(agent.read_text(),'VERSION=6\n');self.assertEqual(calls,[])
 def test_rollback(self):
  root,config,agent,calls,run,payload=self.fixture(True);before=config.read_bytes()
  with patch.object(m.os,'geteuid',return_value=0),patch.object(m.time,'sleep'),self.assertRaisesRegex(RuntimeError,'previous connector script restored'):m.update(payload,root,run)
  self.assertEqual(agent.read_text(),'VERSION=4\n');self.assertEqual(config.read_bytes(),before);self.assertEqual(len(calls),2)
 def test_legacy_pairing_uses_its_existing_service_without_losing_credentials(self):
  root,config,agent,calls,run,payload=self.fixture();before=config.read_bytes()
  legacy_config=config.with_name('homecloud-node-agent.json');config.rename(legacy_config)
  legacy_agent=agent.with_name('homecloud-node-agent.py');agent.rename(legacy_agent)
  with patch.object(m.os,'geteuid',return_value=0),patch.object(m.time,'sleep'):m.update(payload,root,run)
  self.assertEqual(legacy_config.read_bytes(),before)
  self.assertTrue(legacy_agent.read_text().startswith('VERSION=5'))
  self.assertTrue(all(c[-1]=='homecloud-node-agent.service' for c in calls))
  self.assertFalse(config.exists())
if __name__=='__main__':unittest.main()
