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
 def test_pull_reads_bounded_snapshots_and_compacts_the_final_response(self):
  event={'id':'layer','status':'Downloading','progressDetail':{'current':1048576,'total':2097152}}
  snapshots=['pending\n\n'+json.dumps(event)+'\n','0\n200\n'+json.dumps({'id':'layer','status':'Pull complete'})+'\n']
  def guest(host,script,timeout):
   if 'tail -c' in script:return snapshots.pop(0)
   return ''
  reports=[]
  with patch.object(agent,'guest_run',side_effect=guest) as run,patch.object(agent.time,'sleep'):
   result=agent.docker_pull('qemu/100','/images/create?fromImage=nginx',30,reports.append)
  self.assertEqual(result['status'],200);self.assertLess(len(result['body']),1000);self.assertEqual(reports[0][0]['progressDetail']['current'],1048576)
  scripts=[call.args[1] for call in run.call_args_list];self.assertIn('--no-buffer',scripts[0]);self.assertTrue(any('tail -c 16384' in script for script in scripts));self.assertTrue(scripts[-1].startswith('rm -rf -- /tmp/homecloud-pull-'))
 def test_pull_timeouts_and_registry_errors_are_not_reported_as_success(self):
  for snapshot in ['28\n200\n','0\n200\n'+json.dumps({'error':'registry rejected'})+'\n']:
   def guest(host,script,timeout):return snapshot if 'tail -c' in script else ''
   with patch.object(agent,'guest_run',side_effect=guest):
    if snapshot.startswith('28'):
     with self.assertRaisesRegex(RuntimeError,'timed out'):agent.docker_pull('node','/images/create?fromImage=nginx',30,lambda e:None)
    else:self.assertIn('error',json.loads(base64.b64decode(agent.docker_pull('node','/images/create?fromImage=nginx',30,lambda e:None)['body'])))
 def test_large_live_pull_crosses_a_bounded_guest_bridge(self):
  import http.server,socketserver,threading,subprocess,shutil
  if not shutil.which('curl'):self.skipTest('curl is required for local Docker socket fixture')
  release=threading.Event()
  class Handler(http.server.BaseHTTPRequestHandler):
   def log_message(self,*args):pass
   def do_POST(self):
    self.send_response(200);self.end_headers()
    line=json.dumps({'id':'layer','status':'Downloading','progressDetail':{'current':1048576,'total':2097152}}).encode()+b'\n'
    self.wfile.write(line*1200);self.wfile.flush();release.wait(10)
    self.wfile.write(json.dumps({'id':'layer','status':'Pull complete'}).encode()+b'\n');self.wfile.flush()
  class Server(socketserver.TCPServer):pass
  with tempfile.TemporaryDirectory(prefix='hc-pull-') as directory:
   server=Server(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();sizes=[];observed=[]
   def guest(host,script,timeout):
    output=subprocess.run(['/bin/sh','-c',script.replace('--unix-socket /var/run/docker.sock','').replace('test -S /var/run/docker.sock','test -d '+directory).replace('http://localhost','http://127.0.0.1:'+str(server.server_address[1]))],capture_output=True,text=True,timeout=timeout,check=True).stdout;sizes.append(len(output));self.assertLess(len(output),64000);return output
   def progress(events):observed.extend(events);release.set()
   try:
    with patch.object(agent,'guest_run',side_effect=guest):result=agent.docker_pull('qemu/100','/images/create?fromImage=nginx',15,progress)
    self.assertEqual(result['status'],200);self.assertTrue(observed);self.assertLess(len(result['body']),1000);self.assertTrue(release.is_set())
   finally:release.set();server.shutdown();server.server_close();thread.join(timeout=2)
class OperationalTests(unittest.TestCase):
 def job(self,body,host='node'):
  return {'host':host,'body':base64.b64encode(json.dumps(body).encode()).decode()}
 def test_invalid_operational_actions_never_run_a_command(self):
  with patch.object(agent,'run') as run:
   for body in [{'action':'shell'},{'action':'vpn-setup','address':'10.0.0.1/16','port':51820},{'action':'vpn-add','publicKey':'bad'}]:
    with self.assertRaises(Exception):agent.operations_job(self.job(body))
   with self.assertRaises(RuntimeError):agent.operations_job(self.job({'action':'network-check'},'qemu/100'))
   run.assert_not_called()
 def test_network_checks_use_fixed_https_targets_and_report_timings(self):
  with patch.object(agent,'run',return_value='401 0.010 0.020 0.030') as run:
   response=agent.operations_job(self.job({'action':'network-check','url':'http://untrusted'}));data=json.loads(base64.b64decode(response['body']))
   self.assertEqual(len(data['checks']),3);self.assertEqual(data['checks'][0]['dnsMilliseconds'],10)
   for call in run.call_args_list:self.assertTrue(call.args[0][-1].startswith('https://'));self.assertNotIn('untrusted',str(call))
 def test_gateway_never_overwrites_an_existing_configuration(self):
  with patch.object(agent.pathlib.Path,'exists',return_value=True),patch.object(agent,'run') as run:
   with self.assertRaisesRegex(RuntimeError,'will not be overwritten'):agent.operations_job(self.job({'action':'vpn-setup','address':'10.77.0.1/24','port':51820}))
   run.assert_not_called()
class LanPolicyTests(unittest.TestCase):
 def setUp(self):
  self.key='A'*43+'=';self.peers={self.key:'10.77.0.2/32'};self.gateway=agent.ipaddress.ip_interface('10.77.0.1/24')
  self.routes=[{'dst':'192.168.20.0/24','dev':'vmbr0'},{'dst':'192.168.30.0/24','dev':'vmbr0.30'}]
  self.rule={'publicKey':self.key,'destination':'192.168.20.10/32','protocol':'tcp','port':8006,'interface':'vmbr0','nat':False}
 def policy(self,**extra):return {'authorized':True,'rules':[dict(self.rule)],**extra}
 def test_routes_protocols_ports_authorization_and_network_overlap(self):
  self.assertEqual(agent.vpn_policy(self.policy(),self.gateway,self.peers,self.routes)['rules'],[self.rule])
  for change in [{'destination':'0.0.0.0/0'},{'destination':'192.168.20.0/24'},{'destination':'10.77.0.3/32'},{'destination':'8.8.8.8/32'},{'interface':'vmbr0.30'},{'interface':'vmbr0;reboot'},{'port':0},{'protocol':'all'},{'publicKey':'unknown'},{'nat':'yes'}]:
   with self.subTest(change=change),self.assertRaises(Exception):agent.vpn_policy(self.policy(rules=[{**self.rule,**change}]),self.gateway,self.peers,self.routes)
  for body in [self.policy(authorized=False),self.policy(clientNetworks=['192.168.20.0/24']),self.policy(clientNetworks=['10.77.0.0/24'])]:
   with self.assertRaises(Exception):agent.vpn_policy(body,self.gateway,self.peers,self.routes)
  with self.assertRaises(Exception):agent.vpn_policy(self.policy(),self.gateway,self.peers,[{'dst':'default','dev':'vmbr0'}])
  with self.assertRaises(Exception):agent.vpn_policy(self.policy(),self.gateway,self.peers,self.routes+[{'dst':'10.77.0.0/16','dev':'eth0'}])
 def test_vlan_rules_are_explicit_and_revoked_peers_have_no_rules(self):
  rule={**self.rule,'destination':'192.168.30.10/32','interface':'vmbr0.30','nat':True}
  policy=agent.vpn_policy(self.policy(rules=[rule]),self.gateway,self.peers,self.routes)
  script=agent.vpn_firewall(policy,self.peers)
  self.assertIn('oifname "vmbr0.30"',script);self.assertIn('tcp dport 8006',script);self.assertIn('masquerade',script)
  self.assertIn('iifname "icvpn" drop',script);self.assertIn('oifname "icvpn" drop',script)
  self.assertNotIn('192.168.20.10',script);self.assertNotIn('flush ruleset',script)
  revoked=agent.vpn_firewall(policy,{})
  self.assertNotIn('8006',revoked);self.assertNotIn('masquerade',revoked);self.assertIn('iifname "icvpn" drop',revoked)
 def test_nft_validation_failure_does_not_apply_transaction(self):
  with patch.object(agent.subprocess,'run') as process,patch.object(agent,'run',side_effect=RuntimeError('invalid nft')) as run:
   process.return_value.returncode=0
   with self.assertRaises(RuntimeError):agent.apply_vpn_firewall(self.policy(),self.peers)
   self.assertEqual(run.call_count,1);self.assertIn('--check',run.call_args.args[0]);self.assertTrue(run.call_args.kwargs['input_data'].startswith('delete table inet iclusters_lan'))
 def test_failed_persistence_restores_previous_firewall_and_policy(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);config=root/'icvpn.conf';policy=root/'lan.json';helper=root/'routing.py'
   original='[Interface]\nAddress = 10.77.0.1/24\nPrivateKey = PRIVATE\n';config.write_text(original);policy.write_text('{"rules":[]}')
   real_replace=pathlib.Path.replace
   def replace(source,target):
    if target==config:raise OSError('disk failure')
    return real_replace(source,target)
   with patch.object(agent,'VPN_CONFIG',config),patch.object(agent,'VPN_POLICY',policy),patch.object(agent,'VPN_HELPER',helper),patch.object(agent,'vpn_peers',return_value=self.peers),patch.object(agent,'command_json',side_effect=[self.routes,[],[{'dev':'vmbr0'}]]),patch.object(agent,'run',return_value='0'),patch.object(agent,'apply_vpn_firewall') as firewall,patch.object(pathlib.Path,'replace',replace):
    with self.assertRaisesRegex(OSError,'disk failure'):agent.vpn_lan_change(self.policy())
    self.assertEqual(config.read_text(),original);self.assertEqual(json.loads(policy.read_text()),{'rules':[]})
    self.assertEqual(firewall.call_count,2);self.assertEqual(firewall.call_args.args[0],{'rules':[]})
 def test_revocation_persists_removal_even_if_live_peer_removal_fails(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);config=root/'icvpn.conf';policy=root/'lan.json'
   config.write_text('[Interface]\nAddress = 10.77.0.1/24\nPrivateKey = SECRET\n[Peer]\nPublicKey = '+self.key+'\nAllowedIPs = 10.77.0.2/32\n')
   policy.write_text(json.dumps(self.policy()))
   def command(args,**kwargs):
    if args[:2]==['wg','show']:return self.key+'\t10.77.0.2/32'
    if args[:2]==['wg','set']:
     self.assertNotIn(self.key,config.read_text());self.assertEqual(json.loads(policy.read_text())['rules'],[])
     raise RuntimeError('live removal failed')
    raise AssertionError(args)
   job={'host':'node','body':base64.b64encode(json.dumps({'action':'vpn-remove','publicKey':self.key}).encode()).decode()}
   with patch.object(agent,'VPN_CONFIG',config),patch.object(agent,'VPN_POLICY',policy),patch.object(agent,'run',side_effect=command),patch.object(agent,'apply_vpn_firewall') as firewall:
    with self.assertRaisesRegex(RuntimeError,'live removal failed'):agent.operations_job(job)
    self.assertEqual(firewall.call_args.args[1],{});self.assertNotIn(self.key,config.read_text())
 def test_disable_retains_guard_and_does_not_reset_shared_forwarding(self):
  script=agent.vpn_firewall({'rules':[]},self.peers)
  self.assertIn('iifname "icvpn" drop',script);self.assertNotIn('masquerade',script)

class TemperatureTests(unittest.TestCase):
 def test_temperature_sources_preserve_126_and_fault_metadata(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);hw=root/'hwmon0';hw.mkdir();(hw/'name').write_text('dell_smm');(hw/'temp8_input').write_text('126000')
   cpu=root/'hwmon1';cpu.mkdir();(cpu/'name').write_text('coretemp');(cpu/'temp1_input').write_text('62000');(cpu/'temp1_label').write_text('Package id 0');(cpu/'temp1_crit').write_text('100000');(cpu/'temp1_max').write_text('80000');(cpu/'temp1_fault').write_text('0')
   rows=agent.collect_temperatures(root,root/'missing');self.assertEqual(rows[0]['celsius'],126);self.assertEqual(rows[0]['rawMilliCelsius'],126000);self.assertIsNone(rows[0]['fault']);self.assertEqual(rows[0]['label'],'');self.assertEqual(rows[0]['source'],str(hw/'temp8_input'));self.assertEqual(rows[1]['label'],'Package id 0');self.assertEqual(rows[1]['criticalCelsius'],100);self.assertFalse(rows[1]['fault'])
 def test_failed_and_invalid_temperatures_are_not_zero_or_healthy(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);hw=root/'hwmon0';hw.mkdir();(hw/'name').write_text('fixture');(hw/'temp1_input').write_text('invalid');(hw/'temp1_fault').write_text('1');(hw/'temp2_input').write_text('500000')
   rows=agent.collect_temperatures(root,root/'missing');self.assertIsNone(rows[0]['celsius']);self.assertTrue(rows[0]['fault']);self.assertIsNone(rows[1]['celsius'])

class DiskTests(unittest.TestCase):
 def test_physical_whole_disks_only_and_sector_units_preserved(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);sysroot=root/'block';sysroot.mkdir()
   for name in ['sda','sda1','dm-0','loop0','sdb']:(sysroot/name).mkdir()
   for name in ['sda','sda1','dm-0','sdb']:(sysroot/name/'device').mkdir()
   (sysroot/'sda1'/'partition').write_text('1')
   (sysroot/'dm-0'/'slaves').mkdir();(sysroot/'dm-0'/'slaves'/'sda').touch()
   stats=root/'diskstats';stats.write_text(''.join(f'8 {i} {name} 1 2 100 4 5 6 200 8 9 10 11\n' for i,name in enumerate(['sda','sda1','dm-0','loop0','sdb'])))
   boot=root/'boot';boot.write_text('fixture-boot')
   report=agent.collect_disk(stats,sysroot,boot)
   self.assertEqual(len(report['devices']),2);self.assertEqual(report['devices'][0],{'id':'8:0','read':'100','write':'200'})
   self.assertEqual(report['bootId'],'fixture-boot')

if __name__=='__main__':unittest.main()
