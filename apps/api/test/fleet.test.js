import test from 'node:test';
import assert from 'node:assert/strict';
import {createDockerFleet,monitoredDocker} from '../src/docker-fleet.js';
import {selectedAgentHost,agentContext} from '../src/node-agents.js';
import {createMonitor,alertConditions} from '../src/monitor.js';
import {discovered} from '../src/discovery.js';
const inventory=(name,cpu=90)=>({host:{hostname:name,engineId:name},containers:[{id:'same-id',name:'app',status:'running',cpu,memoryPercent:80}],volumes:[],networks:[]});
test('fleet samples hosts in isolated contexts, retains partial success and detects offline hosts',async()=>{
 let list=[{id:'a',node:'node01',name:'first',online:true},{id:'b',node:'node02',name:'second',online:true}];
 const read=createDockerFleet({hosts:()=>list,read:async()=>{const host=selectedAgentHost();if(host==='b')throw Error('unavailable');return inventory(host)}});
 const data=await agentContext.run({host:'caller'},()=>read());assert.equal(data.hosts[0].status,'reachable');assert.equal(data.hosts[1].status,'error');
 list[0].online=false;const offline=await read();assert.equal(offline.hosts[0].status,'error');assert.ok(offline.hosts[0].lastSeen);
 list=[];assert.deepEqual((await read()).hosts,[]);
});
test('identical container IDs remain separate across hosts and the same Engine is deduplicated',()=>{
 const s={docker:inventory('direct'),dockerFleet:{hosts:[{id:'a',status:'reachable',inventory:inventory('engine-a')},{id:'b',status:'reachable',inventory:inventory('engine-b')},{id:'alias',status:'reachable',inventory:inventory('direct')}]}};
 assert.equal(monitoredDocker(s).length,3);assert.equal(new Set(monitoredDocker(s).map(c=>c.monitorId)).size,3);
 const resources=discovered(s).resources;assert.equal(resources.length,3);assert.equal(new Set(resources.map(r=>r.id)).size,3);
 const alerts=alertConditions({...s,services:[]},[{id:'cpu',name:'CPU',metric:'cpu',threshold:85,provider:'docker'}]);
 assert.equal(alerts.length,3);assert.equal(new Set(alerts.map(a=>a.key)).size,3);
});
test('host threshold alerts survive its outage and resolve only after that host reports recovery',async()=>{
 const state={rules:[{id:'cpu',name:'CPU',metric:'cpu',threshold:85,provider:'docker'}],alerts:[],metrics:[]};let offline=false,cpu=90;
 const monitor=createMonitor({}, {get:()=>state,mutate:fn=>fn(state)},async()=>[],async()=>({hosts:[
  offline?{id:'a',node:'node01',name:'first',status:'error',error:'offline'}:{id:'a',node:'node01',name:'first',status:'reachable',inventory:inventory('a',cpu)},
  {id:'b',node:'node02',name:'second',status:'reachable',inventory:inventory('b',10)}]}));
 await monitor.sample(true);const alert=state.alerts.find(a=>a.key.startsWith('rule:'));assert.equal(alert.status,'active');assert.equal(state.metrics[0].docker.length,2);
 offline=true;await monitor.sample(true);assert.equal(alert.status,'active');
 offline=false;cpu=10;await monitor.sample(true);assert.equal(alert.status,'resolved');
});
test('a paired node that has not polled is monitored as offline',async()=>{
 const fleet=createDockerFleet({hosts:()=>[],nodes:()=>[{id:'paired',name:'node01',online:false}],read:async()=>{throw Error('must not query offline agent')}});
 const r=await fleet();assert.equal(r.hosts[0].id,'paired:node-agent');assert.equal(r.hosts[0].status,'error');
});
test('partial statistics remain visible without claiming that missing metrics recovered',async()=>{
 const fleet=createDockerFleet({hosts:()=>[{id:'a',online:true}],read:async()=>({...inventory('a'),errors:['statistics unavailable']})});
 const result=await fleet();assert.equal(result.hosts[0].status,'partial');assert.equal(monitoredDocker({dockerFleet:result}).length,1);
});
test('missing CPU measurements do not resolve a Docker threshold alert',async()=>{
 let cpu=90;const state={rules:[{id:'cpu',name:'CPU',metric:'cpu',threshold:85,provider:'docker'}],alerts:[],metrics:[]};
 const monitor=createMonitor({}, {get:()=>state,mutate:fn=>fn(state)},async()=>[],async()=>({hosts:[{id:'a',status:'reachable',inventory:inventory('a',cpu)}]}));
 await monitor.sample(true);cpu=null;await monitor.sample(true);assert.equal(state.alerts[0].status,'active');
 cpu=10;await monitor.sample(true);assert.equal(state.alerts[0].status,'resolved');
});
test('guest discovery deduplicates containers only on the same reported host',()=>{
 const s={docker:inventory('direct'),proxmox:{guestInventory:{reports:[{id:'other',hostname:'other-host',services:[],containers:[{id:'same-id',name:'other-app',status:'running'}]},{id:'matching',hostname:'direct',services:[],containers:[{id:'same-id',name:'app',status:'running'}]}]}}};
 const rows=discovered(s).resources.filter(r=>r.kind==='Docker container');assert.equal(rows.length,2);assert.ok(rows.some(r=>r.name==='other-app'));
});

test('cached measurements remain available while a provider refresh is blocked',async()=>{
 const state={rules:[],alerts:[],metrics:[]};let release,blocked=false;
 const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>{if(blocked)await new Promise(resolve=>{release=resolve;});return {nodes:[],storage:[],errors:[]};}}},{get:()=>state,mutate:fn=>fn(state)},async()=>[]);
 const first=await monitor.sample(true);blocked=true;
 const refreshing=monitor.sample(true);
 assert.equal(await monitor.sample(),first);
 release();await refreshing;
 assert.notEqual(await monitor.sample(),first);
});

test('fleet errors identify timeouts and Engine authorization without leaking provider response bodies',async()=>{
 let message='Node agent request timed out';const fleet=createDockerFleet({hosts:()=>[{id:'a',online:true}],read:async()=>{throw Error(message)}});
 assert.match((await fleet()).hosts[0].error,/timed out/);message='Docker HTTP 403: secret-provider-body';const denied=(await fleet()).hosts[0].error;assert.match(denied,/Docker HTTP 403/);assert.doesNotMatch(denied,/secret-provider-body/);
 message='arbitrary secret';assert.doesNotMatch((await fleet()).hosts[0].error,/arbitrary secret/);
});


test('offline connector placeholder resolves after that exact connector reconnects with discovered hosts',async()=>{
 let nodes=[{id:'a',name:'node01',online:false},{id:'b',name:'node02',online:false}],hosts=[];
 const fleet=createDockerFleet({hosts:()=>hosts,nodes:()=>nodes,read:async()=>inventory('guest',10)});
 const state={rules:[],alerts:[],metrics:[]};
 const monitor=createMonitor({}, {get:()=>state,mutate:fn=>fn(state)},async()=>[],fleet);
 await monitor.sample(true);
 const first=state.alerts.find(a=>a.connectorId==='docker:a:node-agent'),second=state.alerts.find(a=>a.connectorId==='docker:b:node-agent');
 assert.equal(first.status,'active');assert.equal(second.status,'active');
 nodes=[{id:'a',name:'node01',online:true,lastSeen:new Date().toISOString()},nodes[1]];
 hosts=[{id:'a:qemu/101',agent:'a',node:'node01',name:'guest',online:true}];
 await monitor.sample(true);
 assert.equal(first.status,'resolved');assert.ok(first.resolvedAt);assert.equal(second.status,'active');
 assert.ok(!state.alerts.some(a=>a.connectorId==='docker:a:qemu/101'&&a.status==='active'));
});
test('missing, revoked and offline connector readings cannot resolve a stored offline placeholder',async()=>{
 const state={rules:[],alerts:[{id:'old',key:'connection:docker:a:node-agent',connectorId:'docker:a:node-agent',provider:'docker',status:'active'}],metrics:[]};
 let connectors=[];
 const monitor=createMonitor({}, {get:()=>state,mutate:fn=>fn(state)},async()=>[],async()=>({hosts:[],connectors}));
 for(const reports of [[],[{id:'b',online:true}],[{id:'a',online:false}]]){connectors=reports;await monitor.sample(true);assert.equal(state.alerts[0].status,'active')}
 connectors=[{id:'a',online:true}];await monitor.sample(true);assert.equal(state.alerts[0].status,'resolved');
});

test('monitor sends one connection recovery notification when the paired node returns',async()=>{
 const {createNotifier}=await import('../src/notifications.js');
 const state={rules:[],alerts:[],metrics:[],notificationPreferences:{enabled:true,channels:{discord:true},notifyResolved:false,minimumSeverity:'critical'}},sent=[],deliveries=[];
 let nodes=[{id:'a',name:'node01',online:false}],hosts=[];
 const persistence={get:()=>state,mutate:fn=>fn(state)};
 const notifier=createNotifier({persistence,env:{DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/test',DISCORD_NOTIFICATION_FILTER:'critical'},send:async(c,t,o)=>sent.push(o.notification)});
 const fleet=createDockerFleet({hosts:()=>hosts,nodes:()=>nodes,read:async()=>inventory('guest',10)});
 const monitor=createMonitor({},persistence,async()=>[],fleet,alerts=>{const delivery=notifier.deliver(alerts);deliveries.push(delivery);return delivery});
 await monitor.sample(true);await Promise.all(deliveries);sent.length=0;
 nodes=[{id:'a',name:'node01',online:true,lastSeen:new Date().toISOString()}];hosts=[{id:'a:qemu/101',agent:'a',node:'node01',name:'guest',online:true}];
 await monitor.sample(true);await Promise.all(deliveries);assert.equal(sent.length,1);assert.match(sent[0].title,/Connection restored: Docker node01/);
 await monitor.sample(true);await Promise.all(deliveries);assert.equal(sent.length,1);
});
