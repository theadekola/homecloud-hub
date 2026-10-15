import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'network-telemetry-'));
const {acceptNetworkReport,nodeNetworkTelemetry,NETWORK_FRESH_MS}=await import('../src/network-telemetry.js');const a=await import('../src/node-agents.js');const {networkInventory}=await import('../src/network.js');
const sample=(uptime,rx='1000',tx='2000',extra={})=>({status:'ok',bootId:'boot-a',uptime,interfaces:[{name:'nic0',ifindex:2,mac:'02:00:00:00:00:01',addresses:['192.0.2.10/24','2001:db8::10/64'],speed:1000,rxBytes:rx,txBytes:tx,...extra}]});
test('interface rates use elapsed samples, preserve zero and support full uint64 counters',()=>{
 const first=acceptNetworkReport(null,sample(10,'9007199254740993','2000'),1000);assert.equal(first.interfaces[0].rxMbps,null);const next=acceptNetworkReport(first,sample(15,'9007199259740993','2000'),6000);assert.equal(next.interfaces[0].rxMbps,8);assert.equal(next.interfaces[0].txMbps,0);assert.equal(next.interfaces[0].speed,1000);assert.deepEqual(next.interfaces[0].addresses,['192.0.2.10/24','2001:db8::10/64']);
 assert.equal(acceptNetworkReport(acceptNetworkReport(null,sample(0),1000),sample(Number.MIN_VALUE,'2000'),1001).interfaces[0].rxMbps,null);
 const duplicate=acceptNetworkReport(next,sample(15),15000);assert.equal(duplicate,next);assert.equal(duplicate.receivedAt,6000);
});
test('counter resets, reboots, replacement interfaces and long gaps restart rates',()=>{
 const first=acceptNetworkReport(null,sample(10),1000);
 for(const input of [sample(15,'10','20'),{...sample(15),bootId:'boot-b'},sample(15,'5000','6000',{ifindex:3}),sample(15,'5000','6000',{mac:'02:00:00:00:00:02'}),sample(100,'5000','6000')]){const next=acceptNetworkReport(first,input,6000);assert.equal(next.interfaces[0].rxMbps,null);assert.equal(next.interfaces[0].txMbps,null)}
 assert.equal(acceptNetworkReport(first,sample(9),2000),first);
});
test('invalid reports are bounded and missing or unsupported values remain unknown',()=>{
 for(const input of [{...sample(10),interfaces:Array(513).fill(sample(10).interfaces[0])},sample(10,'-2','20'),sample(10,'18446744073709551616','20')]){const result=acceptNetworkReport(null,input);if(input.interfaces.length>512)assert.equal(result.status,'error');else assert.equal(result.interfaces[0].rxBytes,null)}
 for(const extra of [{name:'../bad'},{name:'..'},{addresses:['bad/24']},{addresses:['192.0.2.1/99']},{ifindex:0}])assert.equal(acceptNetworkReport(null,sample(10,'10','20',extra)).status,'error');
 const virtual=acceptNetworkReport(null,sample(10,null,null,{speed:-1,speedReason:'virtual'}));assert.equal(virtual.interfaces[0].speed,null);assert.equal(virtual.interfaces[0].speedReason,'Not applicable to a virtual interface');assert.equal(virtual.interfaces[0].rxBytes,null);
});
test('telemetry is scoped to original Proxmox hostnames and handles offline, old and duplicate connectors',()=>{
 const network=acceptNetworkReport(null,sample(10),1000),report={hostname:'a.example.test',kind:'proxmox',online:true,version:3,network};assert.equal(nodeNetworkTelemetry('a',[report],1001).status,'ok');assert.equal(nodeNetworkTelemetry('other',[report],1001).status,'unpaired');assert.equal(nodeNetworkTelemetry('a',[{...report,kind:'docker'}],1001).status,'unpaired');assert.equal(nodeNetworkTelemetry('a',[report,report],1001).status,'ambiguous');assert.equal(nodeNetworkTelemetry('a',[{...report,version:2}],1001).status,'update-required');assert.equal(nodeNetworkTelemetry('a',[{...report,online:false}],1001).status,'offline');assert.equal(nodeNetworkTelemetry('a',[report],1001+NETWORK_FRESH_MS).status,'stale');
});
test('network inventory merges live readings without changing edit configuration or leaking across hosts',async()=>{
 const record=acceptNetworkReport(acceptNetworkReport(null,sample(10),Date.now()),sample(15,'5001000','2000'),Date.now());const requests=[];
 const result=await networkInventory(async p=>{requests.push(p);return p==='/nodes'?[{node:'a'},{node:'b'}]:[{iface:'nic0',type:'eth',active:1,cidr:'192.0.2.20/24',cidr6:'2001:db8::20/64'}]},()=>[{hostname:'a',name:'b',kind:'proxmox',online:true,version:3,network:record}]);
 const [one,two]=result.interfaces.sort((a,b)=>a.node.localeCompare(b.node));assert.equal(one.rxMbps,8);assert.equal(one.txMbps,0);assert.equal(one.cidr,'192.0.2.20/24');assert.equal(one.cidr6,'2001:db8::20/64');assert.ok(one.displayAddresses.includes('2001:db8::10/64'));assert.equal(two.speed,null);assert.equal(two.telemetryStatus,'unpaired');assert.deepEqual(two.liveAddresses,[]);assert.ok(requests.every(p=>p==='/nodes'||p.endsWith('/network')));
 const stale=await networkInventory(async p=>p==='/nodes'?[{node:'a'}]:[{iface:'nic0',cidr6:'2001:db8::20/64'}],()=>[{hostname:'a',kind:'proxmox',online:true,version:3,network:{...record,receivedAt:Date.now()-NETWORK_FRESH_MS-1}}]);assert.equal(stale.interfaces[0].rxMbps,null);assert.equal(stale.interfaces[0].speed,null);assert.deepEqual(stale.interfaces[0].displayAddresses,['2001:db8::20/64']);
});
test('authenticated poll telemetry is optional and does not interfere with existing Docker jobs',async()=>{
 const node=a.pairNode(a.createPairing({name:'Friendly name'}).code,'a'),identity=a.authenticateAgent(node.token),hosts=[{id:'node',online:true}];try{
 a.pollAgent(identity,{version:2,hosts});assert.equal(a.agentNetworkReports().find(r=>r.id===node.id).version,2);
 a.pollAgent(identity,{version:3,hosts,network:{...sample(10),node:'b'}});assert.equal(a.agentNetworkReports().find(r=>r.id===node.id).hostname,'a');assert.equal(a.agentNetworkReports().find(r=>r.id===node.id).network.status,'ok');
 a.pollAgent(identity,{version:4,hosts});assert.equal(a.agentNetworkReports().find(r=>r.id===node.id).version,4);
 const pending=a.agentContext.run({host:node.id+':node'},()=>a.agentRequest('/info'));const job=a.pollAgent(identity,{version:3,hosts,network:{status:'bad'}}).jobs[0];assert.equal(job.path,'/info');assert.equal(a.agentNetworkReports().find(r=>r.id===node.id).network.status,'error');a.pollAgent(identity,{version:3,hosts,results:[{id:job.id,status:200,body:Buffer.from('{"ServerVersion":"fixture"}').toString('base64')}]});assert.equal((await(await pending).json()).ServerVersion,'fixture');
 }finally{a.revokeAgent(node.id)}assert.ok(!a.agentNetworkReports().some(r=>r.id===node.id));
});
test.after(()=>fs.rmSync(process.env.DATA_DIR,{recursive:true,force:true}));
