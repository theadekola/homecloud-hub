import test from 'node:test';import assert from 'node:assert/strict';
import {createMonitor} from '../src/monitor.js';import {createDockerFleet} from '../src/docker-fleet.js';import {selectedAgentHost} from '../src/node-agents.js';import {createReadCache} from '../src/read-cache.js';import {createGuestFilesystemReader} from '../src/guest-filesystem-cache.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const tick=()=>new Promise(r=>setImmediate(r));
const memory=()=>{const state={metrics:[],rules:[],alerts:[]};return {get:()=>state,mutate:fn=>fn(state)}};
test('cold pages get completed providers while a blocked fleet continues without resolving alerts',async()=>{
 const wait=deferred(),persistence=memory();persistence.get().alerts.push({id:'keep',provider:'docker',status:'active',key:'connection:docker'});
 const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>({nodes:[{name:'fast',status:'online'}],storage:[],errors:[]})}},persistence,async()=>[],()=>wait.promise);
 try{const partial=await monitor.sample();assert.equal(partial.refreshing,true);assert.equal(partial.proxmox.nodes[0].name,'fast');assert.equal(partial.services.find(s=>s.id==='docker-fleet').status,'pending');assert.equal(persistence.get().alerts[0].status,'active');assert.equal(persistence.get().metrics.length,0);wait.resolve({hosts:[]});const full=await monitor.sample(true);assert.equal(full.refreshing,undefined);assert.equal(persistence.get().metrics.length,1);}finally{wait.resolve({hosts:[]})}
});
test('provider pages do not await unrelated sources and concurrent reads share one provider request',async()=>{
 const slow=deferred();let reads=0;const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>{reads++;return {nodes:[]}}},truenas:{configured:()=>true,read:()=>slow.promise}},memory(),async()=>[]);
 const all=monitor.sample(true);try{const [one,two]=await Promise.all([monitor.provider('proxmox'),monitor.provider('proxmox')]);assert.deepEqual(one.data,{nodes:[]});assert.deepEqual(two.data,one.data);assert.equal(reads,1);assert.equal(monitor.isRefreshing(),true);}finally{slow.resolve({info:{hostname:'slow'}});await all}
});
test('invalidated monitoring work cannot publish old connection data or persist old alerts',async()=>{
 const slow=deferred(),persistence=memory();let old=true;const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>old?slow.promise:{nodes:[],label:'new'}}},persistence,async()=>[]);
 const before=monitor.sample(true);await tick();await monitor.invalidate();old=false;await monitor.sample(true);slow.resolve({nodes:[],label:'old'});await before;assert.equal((await monitor.sample()).proxmox.label,'new');assert.equal(persistence.get().metrics.length,1);
});
test('rolling fleet work advances fast hosts despite slow hosts while bounding global and per-node load',async()=>{
 const gate=deferred(),seen=[],counts=new Map();let active=0,max=0,perNodeMax=0;
 const hosts=[0,1,2,3,4,5].map(i=>({id:String(i),agent:i<3?'a':'b',online:true}));
 const fleet=createDockerFleet({hosts:()=>hosts,read:async()=>{const id=selectedAgentHost(),node=Number(id)<3?'a':'b';seen.push(id);active++;max=Math.max(max,active);counts.set(node,(counts.get(node)||0)+1);perNodeMax=Math.max(perNodeMax,counts.get(node));if(id==='0')await gate.promise;active--;counts.set(node,counts.get(node)-1);return {host:{hostname:id},containers:[]}}});
 const work=fleet();try{await tick();await tick();assert.ok(seen.includes('5'));assert.ok(max<=4);assert.ok(perNodeMax<=2);}finally{gate.resolve();await work}
});
test('read coalescing isolates keys, does not cache errors, and rejects late publication after invalidation',async()=>{
 const cache=createReadCache(),gate=deferred();let calls=0;const read=()=>{calls++;return gate.promise};const a=cache.run('user:a:host:a',read),b=cache.run('user:a:host:a',read);await tick();assert.equal(calls,1);cache.clear();assert.equal(await cache.run('user:a:host:a',async()=>({value:'new'})).then(v=>v.value),'new');gate.resolve({value:'old'});await Promise.all([a,b]);assert.equal((await cache.run('user:a:host:a',read)).value,'new');assert.equal((await cache.run('user:b:host:a',async()=>({value:'other'}))).value,'other');await assert.rejects(cache.run('error',async()=>{throw Error('offline')}));assert.equal(await cache.run('error',async()=>42),42);
});
test('forced inventory reads replace ordinary cached values and partial snapshots are never cached',async()=>{
 const cache=createReadCache();assert.equal(await cache.run('one',async()=>1),1);assert.equal(await cache.run('one',async()=>2),1);assert.equal(await cache.run('one',async()=>2,{force:true}),2);await cache.run('partial',async()=>({refreshing:true}));assert.equal(await cache.run('partial',async()=>3),3);
});
test('report revisits return recent data while sharing background work; explicit refresh waits and expiry never serves stale data',async()=>{
 let time=0,calls=0;const cache=createReadCache({ttl:10,staleMs:100,now:()=>time}),gate=deferred();
 await cache.run('report',async()=>({rows:['old']}));time=20;
 const read=()=>{calls++;return gate.promise};
 const first=await cache.run('report',read,{background:true}),second=await cache.run('report',read,{background:true});
 assert.deepEqual(first,{rows:['old'],refreshing:true});assert.deepEqual(second,first);assert.equal(calls,1);
 let done=false;const forced=cache.run('report',read,{force:true,background:true}).then(v=>{done=true;return v});await tick();assert.equal(done,false);
 gate.resolve({rows:['new']});assert.deepEqual(await forced,{rows:['new']});assert.deepEqual(await cache.run('report',read),{rows:['new']});
 time=200;const next=deferred();let expiredDone=false;const expired=cache.run('report',()=>next.promise,{background:true}).then(v=>{expiredDone=true;return v});await tick();assert.equal(expiredDone,false);next.resolve({rows:['fresh']});await expired;
});
test('completed provider readings become visible during an unrelated slow refresh without resolving alerts early',async()=>{
 let round=0,slow=false;const gate=deferred(),state=memory();
 const monitor=createMonitor({proxmox:{configured:()=>true,read:async()=>({nodes:[],round:++round})}},state,async()=>[],async()=>slow?gate.promise:{hosts:[]});
 await monitor.sample(true);slow=true;const updating=monitor.sample(true);await tick();
 try{const partial=await monitor.sample();assert.equal(partial.proxmox.round,2);assert.equal(partial.refreshing,true);assert.equal(state.get().metrics.length,1);}finally{gate.resolve({hosts:[]});await updating;}
});
test('optional filesystem checks have a bounded first wait, reuse work and isolate connection identities',async()=>{
 const gate=deferred();let reads=0;const reader=createGuestFilesystemReader(v=>v,{budget:5}),guests=[{node:'n',vmid:100}];const query=async(p,options)=>{reads++;assert.equal(options.timeoutMs,5000);return gate.promise};
 const initial=await reader(guests,query,'one');assert.equal(initial.get('100'),undefined);await reader(guests,query,'one');assert.equal(reads,1);gate.resolve({used:20});await tick();assert.deepEqual((await reader(guests,query,'one')).get('100'),{used:20});const other=deferred();try{assert.equal((await reader(guests,()=>other.promise,'two')).get('100'),undefined);}finally{other.resolve(null)}
});
test('cached summary routes still authenticate every request and isolate actors, roles, queries and explicit refresh',async()=>{
 process.env.JWT_SECRET||='loading-test-access-secret-at-least-32';process.env.JWT_REFRESH_SECRET||='loading-test-refresh-secret-at-least-32';
 const {createApp}=await import('../src/app.js'),{providers}=await import('../src/monitor.js');const configured=providers.docker.configured;providers.docker.configured=()=>false;let reads=0;
 const sample=async()=>{reads++;await tick();return {sampledAt:new Date().toISOString(),services:[{provider:'docker',status:'reachable'}],metrics:[],alerts:[],docker:{host:{hostname:`read-${reads}`},containers:[],images:[],networks:[],volumes:[],stacks:[]}}};
 const app=createApp({authenticate:(req,res,next)=>{if(req.headers['x-deny'])return res.status(401).json({error:'Unauthenticated'});req.user={sub:req.headers['x-actor']||'a',role:req.headers['x-role']||'viewer'};next()},monitor:{sample,invalidate:async()=>{}},audit:async()=>{}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const read=async(path='/docker',headers={})=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{headers});return {status:res.status,body:await res.json()}};
 try{const [a,b]=await Promise.all([read(),read()]);assert.equal(a.status,200);assert.deepEqual(a,b);const baseline=reads;await read('/docker',{'X-HomeCloud-Refresh':'1'});assert.ok(reads>baseline);const refreshed=reads;await read('/docker',{'x-actor':'b'});assert.ok(reads>refreshed);const actor=reads;await read('/docker',{'x-role':'owner'});assert.ok(reads>actor);const role=reads;await read('/docker?scope=other');assert.ok(reads>role);const before=reads;assert.equal((await read('/docker',{'x-deny':'1'})).status,401);assert.equal(reads,before);}finally{providers.docker.configured=configured;server.closeAllConnections();await new Promise(r=>server.close(r))}
});
