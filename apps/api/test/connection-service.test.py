import hashlib,importlib.util,json,pathlib,tempfile,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('service',pathlib.Path(__file__).parents[1]/'src/agent-assets/connection-service.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
STATUS='LoadState=loaded\nActiveState=active\nSubState=running\nResult=success\n'
DOCKER=STATUS+'\n__VERSION__\n28.0.0\n\n__CONTAINERS__\nrunning\nexited\n__CONTAINERS_OK__\n\n__STATS__\n1.2%|20MiB / 1GiB\n'
class Services(unittest.TestCase):
 def fixture(self,kind='proxmox'):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);root=pathlib.Path(tmp.name)
  (root/'etc').mkdir();(root/'usr/local/sbin').mkdir(parents=True)
  (root/'etc/homecloud-node-agent.json').write_text(json.dumps({'id':'paired','token':'private-token','url':'https://private-hub/api','kind':kind}))
  (root/'usr/local/sbin/homecloud-node-agent.py').write_text('VERSION=5\n')
  return root,{'id':'paired','tokenHash':hashlib.sha256(b'private-token').hexdigest(),'action':'connector-check','target':'node'}
 def test_binding_and_validation_before_running(self):
  root,p=self.fixture();calls=[]
  for change in ({'id':'wrong'},{'tokenHash':'bad'},{'target':'node; reboot'},{'action':'arbitrary'},{'action':'connector-start','target':'qemu/100'}):
   with self.assertRaises(RuntimeError):m.diagnose({**p,**change},root,lambda *a,**k:calls.append(a))
  self.assertEqual(calls,[])
 def test_connector_check_is_read_only_and_redacts_logs(self):
  root,p=self.fixture();calls=[];before=(root/'etc/homecloud-node-agent.json').read_bytes()
  def run(args,**kw):
   calls.append(args)
   if args[0]=='journalctl':return '\n'.join(json.dumps({'MESSAGE':message,'__REALTIME_TIMESTAMP':'123'}) for message in ['token=secret private-token https://private-hub/api','Authorization: Bearer header-credential','password=multi word credential','API Key: provider-key'])
   return STATUS
  result=m.diagnose(p,root,run)
  self.assertEqual(result['version'],5);self.assertTrue(result['active']);self.assertNotIn('private-token',json.dumps(result));self.assertNotIn('private-hub',json.dumps(result));self.assertNotIn('token=secret',json.dumps(result));self.assertNotIn('header-credential',json.dumps(result));self.assertNotIn('multi word credential',json.dumps(result));self.assertNotIn('provider-key',json.dumps(result));self.assertNotIn('systemctl start',str(calls));self.assertNotIn('restart',str(calls));self.assertEqual(before,(root/'etc/homecloud-node-agent.json').read_bytes())
 def test_guest_docker_uses_exact_guest_and_fixed_commands(self):
  root,p=self.fixture()
  for target in ('lxc/101','qemu/100','node'):
   calls=[]
   def run(args,**kw):
    calls.append((args,kw));return json.dumps({'exited':1,'exitcode':0,'out-data':DOCKER}) if args[0]=='qm' else DOCKER
   result=m.diagnose({**p,'action':'docker-check','target':target},root,run)
   self.assertTrue(result['docker']['ready']);self.assertEqual(result['docker']['total'],2);self.assertEqual(result['docker']['containers']['running'],1)
   command=str(calls);self.assertNotIn('systemctl start',command);self.assertNotIn('restart',command)
   if target=='qemu/100':self.assertEqual(calls[0][0][:4],['qm','guest','exec','100'])
   if target=='lxc/101':self.assertEqual(calls[0][0][:3],['pct','exec','101'])
 def test_start_is_idempotent_and_never_restarts(self):
  root,p=self.fixture();calls=[]
  def run(args,**kw):calls.append(args);return DOCKER
  result=m.diagnose({**p,'action':'docker-start'},root,run)
  script=calls[0][-1];self.assertIn('if ! systemctl is-active',script);self.assertIn('timeout 30 systemctl start docker.service',script);self.assertNotIn('restart',script);self.assertTrue(result['active'])
 def test_docker_start_does_not_claim_success_without_engine(self):
  root,p=self.fixture()
  with self.assertRaisesRegex(RuntimeError,'Engine is not ready'):m.diagnose({**p,'action':'docker-start'},root,lambda *a,**k:STATUS)
 def test_missing_vm_access_and_standalone_guest_targets_fail(self):
  root,p=self.fixture()
  with self.assertRaisesRegex(RuntimeError,'VM guest access'):m.diagnose({**p,'action':'docker-check','target':'qemu/100'},root,lambda *a,**k:'{"exited":1,"exitcode":1,"err-data":"do not expose"}')
  root,p=self.fixture('docker')
  with self.assertRaisesRegex(RuntimeError,'Standalone'):m.diagnose({**p,'action':'docker-check','target':'lxc/101'},root)
if __name__=='__main__':unittest.main()
