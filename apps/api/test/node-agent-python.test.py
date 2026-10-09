import base64,importlib.util,json,pathlib,unittest
from unittest.mock import patch
module_path=pathlib.Path(__file__).parents[1]/'src'/'agent-assets'/'homecloud-node-agent.py'
spec=importlib.util.spec_from_file_location('agent',module_path);agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
class AgentTests(unittest.TestCase):
 def test_ct_uses_fixed_tool_with_script_on_stdin(self):
  with patch.object(agent,'run',return_value='ok') as run:
   self.assertEqual(agent.guest_run('lxc/130','echo fixture'),'ok')
   self.assertEqual(run.call_args.args[0],['pct','exec','130','--','/bin/sh'])
   self.assertEqual(run.call_args.kwargs['input_data'],'echo fixture')
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
if __name__=='__main__':unittest.main()
