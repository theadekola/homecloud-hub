import base64,importlib.util,json,pathlib,unittest
from unittest.mock import patch
module_path=pathlib.Path(__file__).parents[1]/'src'/'agent-assets'/'homecloud-node-agent.py'
spec=importlib.util.spec_from_file_location('agent',module_path);agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
class AgentTests(unittest.TestCase):
 def test_ct_uses_fixed_tool_with_explicit_script(self):
  with patch.object(agent,'run',return_value='ok') as run:
   self.assertEqual(agent.guest_run('lxc/130','echo fixture'),'ok')
   self.assertEqual(run.call_args.args[0],['pct','exec','130','--','/bin/sh','-c','echo fixture'])
 def test_vm_uses_qga_and_rejects_truncated_output(self):
  with patch.object(agent,'run',return_value=json.dumps({'exited':True,'exitcode':0,'out-data':'ok'})) as run:
   self.assertEqual(agent.guest_run('qemu/100','echo fixture'),'ok')
   self.assertIn('--pass-stdin',run.call_args.args[0]);self.assertEqual(run.call_args.kwargs['input_data'],'echo fixture')
  with patch.object(agent,'run',return_value=json.dumps({'exited':True,'exitcode':0,'out-truncated':True})):
   with self.assertRaises(RuntimeError):agent.guest_run('qemu/100','echo fixture')
 def test_binary_response_survives_bridge(self):
  binary=b'\x01\x00\xfflog';encoded=base64.b64encode(binary+b'\n__HOMECLOUD_STATUS__200').decode()
  with patch.object(agent,'guest_run',return_value=encoded):
   result=agent.docker_request('lxc/130','/containers/abc/logs?stdout=1');self.assertEqual(base64.b64decode(result['body']),binary);self.assertEqual(result['status'],200)
 def test_rejects_non_docker_paths(self):
  with self.assertRaises(RuntimeError):agent.docker_request('node','/host-shell')
 def test_invalid_response_is_actionable(self):
  with patch.object(agent,'guest_run',return_value=''):
   with self.assertRaisesRegex(RuntimeError,'invalid Docker response'):agent.docker_request('lxc/131','/info')
 def test_setup_rejects_node_and_unsupported_os(self):
  with self.assertRaisesRegex(RuntimeError,'only inside guests'):agent.setup_guest('node')
  with patch.object(agent,'guest_run',return_value='alpine'):
   with self.assertRaisesRegex(RuntimeError,'Debian and Ubuntu'):agent.setup_guest('lxc/131')
 def test_ct_setup_preserves_features_and_checks_result(self):
  with patch.object(agent,'guest_run',side_effect=['debian','Docker setup verified']) as guest,patch.object(agent,'run',return_value='features: keyctl=1,nesting=0\n') as run,patch.object(agent,'post',return_value={'script':'fixed fixture setup'}) as post,patch.object(agent,'CONFIG',{},create=True):
   result=agent.setup_guest('lxc/131')
   self.assertEqual(run.call_args.args[0],['pct','set','131','--features','keyctl=1,nesting=1'])
   self.assertEqual(guest.call_args.args,('lxc/131','fixed fixture setup'));self.assertEqual(guest.call_args.kwargs['timeout'],900)
   self.assertEqual(result['status'],200)
 def test_standalone_rejects_guest_execution(self):
  with patch.object(agent,'CONFIG',{'kind':'docker'},create=True),patch.object(agent,'run') as run:
   with self.assertRaisesRegex(RuntimeError,'Standalone'):agent.guest_run('qemu/100','echo fixture')
   with self.assertRaisesRegex(RuntimeError,'Standalone'):agent.guest_run('lxc/100','echo fixture')
   run.assert_not_called()
 def test_standalone_scan_never_invokes_proxmox_tools(self):
  class StopScan(Exception):pass
  class StopEvent:
   def wait(self,*args):raise StopScan()
  with patch.object(agent,'CONFIG',{'kind':'docker'},create=True),patch.object(agent,'run') as run,patch.object(agent,'RESCAN',StopEvent()),patch.object(agent,'docker_request',return_value={'status':200,'body':base64.b64encode(b'{"ServerVersion":"fixture"}').decode()}) as docker:
   with self.assertRaises(StopScan):agent.scan()
   run.assert_not_called();docker.assert_called_once_with('node','/info',timeout=8)
   self.assertEqual(agent.HOSTS[0]['id'],'node')
if __name__=='__main__':unittest.main()
