import test from 'node:test';import assert from 'node:assert/strict';
import {connectionHealth} from '../src/connection-health.js';
const cluster={name:'Home Cluster',host:'pve.example.test',port:8006,source:'saved'};
test('connection inventory uses configured sources without inventing a Direct Engine',()=>{
 const r=connectionHealth({cluster,nodes:[{id:'a',kind:'proxmox',name:'node01',hostname:'n1',online:true,version:4,hosts:[]}],snapshot:{sampledAt:'2026-10-15T20:00:00Z',services:[{provider:'proxmox',status:'reachable'},{provider:'truenas',status:'not-configured'}],proxmox:{nodes:[{}],vms:[{},{}],lxc:[]}}});
 assert.equal(r.connections.length,2);assert.equal(r.counts.online,2);assert.equal(r.connections[0].summary,'1 nodes · 2 VMs · 0 CTs');assert.ok(!r.connections.some(r=>r.id==='direct'));assert.equal(r.writesPerformed,false);
});
test('offline and outdated connectors, guest setup and partial Docker measurements remain distinct',()=>{
 const r=connectionHealth({nodes:[{id:'a',kind:'proxmox',name:'n1',hostname:'n1',online:true,version:3,hosts:[{id:'qemu/100',name:'ready',online:true},{id:'qemu/101',name:'missing',online:false,status:'guest_access_required'}]},{id:'b',kind:'docker',name:'offline',online:false,version:4,hosts:[{id:'node',online:true}]}],snapshot:{dockerFleet:{hosts:[{id:'a:qemu/100',status:'partial',error:'app: statistics unavailable'}]}}});
 const ready=r.connections.find(r=>r.id==='a:qemu/100'),missing=r.connections.find(r=>r.id==='a:qemu/101');assert.equal(ready.status,'attention');assert.equal(ready.verifyHost,'a:qemu/100');assert.ok(ready.issues.some(i=>i.code==='connector-update'));assert.equal(missing.setupAvailable,true);assert.equal(missing.verifyHost,null);assert.equal(r.connections.find(r=>r.id==='b:node').status,'offline');assert.equal(r.counts.offline,1);
});
test('guest ACL failures get the permission guide and pending scans are not permission failures',()=>{
 const r=connectionHealth({cluster,snapshot:{refreshing:true,proxmox:{guestInventory:{limitations:['Guest application discovery is running in the background.','vm: Proxmox HTTP 403: VM.GuestAgent.Unrestricted','vm2: QEMU guest agent not running']}}}});
 assert.equal(r.connections[0].status,'unverified');assert.deepEqual(r.connections[0].issues.map(i=>i.code),['guest-permission','guest-agent']);assert.equal(r.refreshing,true);
});
test('provider integrations expose health without returning server configuration secrets',()=>{
 const r=connectionHealth({direct:{url:'https://docker.test:2376',source:'saved',key:'DO_NOT_RETURN',cert:'DO_NOT_RETURN'},snapshot:{services:[{id:'docker',provider:'docker',status:'reachable'},{provider:'truenas',status:'error',error:'Unavailable'},{provider:'opnsense',status:'reachable'}]}});
 assert.equal(r.connections[0].status,'online');assert.equal(r.connections.find(r=>r.id==='truenas').manage,'/storage');assert.equal(r.connections.find(r=>r.id==='opnsense'),undefined);assert.ok(!JSON.stringify(r).includes('DO_NOT_RETURN'));
});
test('health endpoint enforces owner access and only reads injected monitor results',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');let scans=0,forced=0;
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'viewer'};next()},monitor:{sample:async(force)=>{scans++;if(force)forced++;return {services:[]}},isRefreshing:()=>false},audit:async()=>{throw Error('Read must not perform an action')}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/connections/health`;
 try{for(const role of ['viewer','operator','admin']){const r=await fetch(url,{headers:{'x-role':role}});assert.equal(r.status,403)}assert.equal(scans,0);const r=await fetch(url+'?refresh=1',{headers:{'x-role':'owner'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).writesPerformed,false);assert.equal(forced,1);}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
