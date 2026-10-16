import base64,importlib.util,json,pathlib,unittest,tempfile
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
 def test_network_collection_is_local_read_only_and_keeps_large_counters(self):
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);nic=root/'nic0';(nic/'device').mkdir(parents=True);(nic/'statistics').mkdir();(nic/'speed').write_text('1000');(nic/'statistics'/'rx_bytes').write_text('9007199254740993');(nic/'statistics'/'tx_bytes').write_text('0')
   bridge=root/'vmbr0';(bridge/'statistics').mkdir(parents=True);(bridge/'statistics'/'rx_bytes').write_text('5');(bridge/'statistics'/'tx_bytes').write_text('8');boot=root/'boot';boot.write_text('fixture-boot')
   entries=[{'ifname':'nic0','ifindex':2,'address':'02:00:00:00:00:01','operstate':'UP','addr_info':[{'local':'192.0.2.1','prefixlen':24},{'local':'2001:db8::1','prefixlen':64}]},{'ifname':'vmbr0','ifindex':3,'addr_info':[]},{'ifname':'../outside','ifindex':4,'addr_info':[]}]
   with patch.object(agent,'run',return_value=json.dumps(entries)) as run,patch.object(agent,'guest_run') as guest:
    report=agent.collect_network(str(root),str(boot));run.assert_called_once_with(['ip','-j','address','show'],timeout=3);guest.assert_not_called()
   self.assertEqual(report['bootId'],'fixture-boot');self.assertEqual(len(report['interfaces']),2);self.assertEqual(report['interfaces'][0]['rxBytes'],'9007199254740993');self.assertEqual(report['interfaces'][0]['txBytes'],'0');self.assertEqual(report['interfaces'][0]['speed'],1000);self.assertEqual(report['interfaces'][0]['addresses'],['192.0.2.1/24','2001:db8::1/64']);self.assertEqual(report['interfaces'][1]['speedReason'],'virtual')
 def test_network_missing_counters_and_down_link_are_not_zero_measurements(self):
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);(root/'nic0'/'device').mkdir(parents=True);(root/'nic0'/'speed').write_text('-1')
   with patch.object(agent,'run',return_value=json.dumps([{'ifname':'nic0','ifindex':2,'operstate':'DOWN','addr_info':[]}])):
    row=agent.collect_network(str(root),str(root/'absent-boot'))['interfaces'][0]
   self.assertIsNone(row['speed']);self.assertIsNone(row['rxBytes']);self.assertEqual(row['speedReason'],'link-down')
 def test_poll_sends_completed_results_before_request_and_preserves_them_on_failure(self):
  completed=agent.queue.Queue();completed.put({'id':'done','status':200,'body':'e30='});reads=agent.queue.Queue();writes=agent.queue.Queue();ready=agent.threading.Event()
  with patch.object(agent,'post',return_value={'jobs':[]}) as post,patch.object(agent.time,'sleep'),patch.object(ready,'wait'):
   agent.poll_once({},reads,writes,completed,ready)
   self.assertEqual(post.call_args.args[2]['results'][0]['id'],'done')
  completed.put({'id':'retry','status':200,'body':'e30='})
  with patch.object(agent,'post',side_effect=RuntimeError('offline')):
   with self.assertRaises(RuntimeError):agent.poll_once({},reads,writes,completed,ready)
  self.assertEqual(completed.get_nowait()['id'],'retry')
 def test_expired_work_does_not_execute_and_read_deadline_reaches_curl(self):
  job={'id':'read','operation':'docker','host':'node','path':'/info','method':'GET','body':'','expiresAt':agent.time.time()*1000-1}
  with patch.object(agent,'docker_request') as read:
   self.assertIn('expired',agent.execute_job(job)['error']);read.assert_not_called()
   job['expiresAt']=agent.time.time()*1000+5000;read.return_value={'status':200,'body':'e30='};self.assertEqual(agent.execute_job(job)['status'],200);self.assertLessEqual(read.call_args.kwargs['timeout'],5)
  self.assertFalse(agent.read_job({**job,'method':'POST'}));self.assertFalse(agent.read_job({**job,'path':'/events?since=1'}));self.assertFalse(agent.read_job({**job,'operation':'setup'}))
 def test_installation_does_not_block_reads_and_writes_remain_serial(self):
  import threading
  started,release,read_done,second=threading.Event(),threading.Event(),threading.Event(),threading.Event()
  def execute(job):
   if job['id']=='install':started.set();release.wait(2)
   elif job['id']=='read':read_done.set()
   else:second.set()
   return {'id':job['id'],'status':200,'body':'e30='}
  with patch.object(agent,'execute_job',side_effect=execute):
   reads,writes,completed,ready=agent.start_workers()
   writes.put({'id':'install'});self.assertTrue(started.wait(1));writes.put({'id':'write'});reads.put({'id':'read'})
   try:self.assertTrue(read_done.wait(1));self.assertFalse(second.is_set())
   finally:release.set();writes.join();reads.join()
   self.assertTrue(second.is_set())
 def test_busy_queue_rejects_work_without_executing_and_poll_rate_is_bounded(self):
  reads,writes,completed,ready=agent.queue.Queue(maxsize=1),agent.queue.Queue(),agent.queue.Queue(),agent.threading.Event();reads.put({'id':'existing'})
  with patch.object(agent,'post',return_value={'jobs':[{'id':'new','operation':'docker','method':'GET','path':'/info'}]}),patch.object(agent.time,'sleep') as sleep:
   agent.poll_once({},reads,writes,completed,ready)
   self.assertIn('busy',completed.get_nowait()['error']);self.assertEqual(reads.get_nowait()['id'],'existing');self.assertGreater(sleep.call_args.args[0],.5)
 def test_bulk_stats_runs_one_guest_command_and_preserves_healthy_samples(self):
  import os,subprocess,time
  with tempfile.TemporaryDirectory() as folder:
   executable=pathlib.Path(folder)/'curl'
   executable.write_text("#!/usr/bin/python3\nimport sys,json,time\na=sys.argv[1:];identity=a[-1].split('/containers/')[1].split('/')[0];time.sleep(.04)\nif identity=='id5':print('000',end='');sys.exit(28)\nopen(a[a.index('-o')+1],'w').write(json.dumps({'cpu_stats':{'cpu_usage':{'total_usage':10}},'memory_stats':{'usage':100}}));print('200',end='')\n")
   executable.chmod(0o755)
   def guest(host,script,timeout):
    self.assertEqual(host,'qemu/100');self.assertNotIn('docker stats',script)
    script=script.replace('command -v curl >/dev/null && test -S /var/run/docker.sock','true',1)
    result=subprocess.run(['/bin/sh','-c',script],capture_output=True,text=True,timeout=5,env={**os.environ,'PATH':folder+':/usr/bin:/bin'})
    self.assertEqual(result.returncode,0,result.stderr);return result.stdout
   body=base64.b64encode(json.dumps(['id'+str(i) for i in range(16)]).encode()).decode()
   with patch.object(agent,'guest_run',side_effect=guest) as run:
    result=agent.docker_stats('qemu/100',body,timeout=10)
    self.assertEqual(run.call_count,1)
   samples=json.loads(base64.b64decode(result['body']));self.assertEqual(len(samples),16);self.assertIn('timed out',samples['id5']['error']);self.assertEqual(samples['id15']['stats']['memory_stats']['usage'],100)
 def test_bulk_stats_rejects_script_input_and_uses_read_lane(self):
  for ids in [['../outside'],['id; touch /tmp/no'],['x']*17,[]]:
   with patch.object(agent,'guest_run') as run:
    with self.assertRaises(RuntimeError):agent.docker_stats('node',base64.b64encode(json.dumps(ids).encode()).decode())
    run.assert_not_called()
  self.assertTrue(agent.read_job({'operation':'stats','method':'GET','path':''}))
  job={'id':'bulk','operation':'stats','host':'node','path':'','method':'GET','body':'fixture','expiresAt':agent.time.time()*1000+5000}
  with patch.object(agent,'docker_stats',return_value={'status':200,'body':'e30='}) as bulk,patch.object(agent,'docker_request') as single:
   self.assertEqual(agent.execute_job(job)['status'],200);single.assert_not_called();self.assertLessEqual(bulk.call_args.kwargs['timeout'],5)
 def test_rescan_keeps_existing_running_guests_while_removing_stopped_guests(self):
  class StopScan(Exception):pass
  class StopEvent:
   def wait(self,*args):raise StopScan()
  existing=[{'id':'qemu/100','name':'control','online':True},{'id':'qemu/101','name':'stopped','online':True}]
  def run(args,timeout):return 'VMID NAME STATUS\n100 control running\n101 stopped stopped\n' if args[0]=='qm' else 'VMID STATUS LOCK NAME\n'
  def probe(identity,path,timeout):
   self.assertIn('qemu/100',[h['id'] for h in agent.HOSTS]);self.assertNotIn('qemu/101',[h['id'] for h in agent.HOSTS])
   return {'status':200,'body':base64.b64encode(b'{"ServerVersion":"fixture"}').decode()}
  with patch.object(agent,'HOSTS',existing),patch.object(agent,'CONFIG',{'kind':'proxmox'},create=True),patch.object(agent,'run',side_effect=run),patch.object(agent,'docker_request',side_effect=probe),patch.object(agent,'RESCAN',StopEvent()):
   with self.assertRaises(StopScan):agent.scan()
   self.assertEqual({h['id'] for h in agent.HOSTS},{'node','qemu/100'})
 def test_failed_guest_enumeration_marks_known_guests_unavailable(self):
  class StopScan(Exception):pass
  class StopEvent:
   def wait(self,*args):raise StopScan()
  def run(args,timeout):
   if args[0]=='qm':raise RuntimeError('enumeration failed')
   return 'VMID STATUS LOCK NAME\n'
  with patch.object(agent,'HOSTS',[{'id':'qemu/100','name':'control','online':True}]),patch.object(agent,'CONFIG',{'kind':'proxmox'},create=True),patch.object(agent,'run',side_effect=run),patch.object(agent,'docker_request',return_value={'status':200,'body':base64.b64encode(b'{"ServerVersion":"fixture"}').decode()}),patch.object(agent,'RESCAN',StopEvent()):
   with self.assertRaises(StopScan):agent.scan()
   row=next(h for h in agent.HOSTS if h['id']=='qemu/100');self.assertFalse(row['online']);self.assertIn('guest list unavailable',row['error'])
if __name__=='__main__':unittest.main()
