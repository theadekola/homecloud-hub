import test from 'node:test';
import assert from 'node:assert/strict';
import {guestConnections} from '../src/guest-connections.js';
test('VM connection checks distinguish verified, disabled, stopped, denied and unavailable agents without writes',async()=>{
 const calls=[];const inventory=[1,2,3,4,5].map(vmid=>({vmid,node:'node01',name:'VM '+vmid,type:'qemu',status:vmid===3?'stopped':'running'}));inventory.push({vmid:6,node:'node01',type:'lxc',status:'running'});
 const result=await guestConnections(async(path,init)=>{calls.push({path,init});if(path.startsWith('/cluster/resources'))return inventory;const id=Number(path.match(/qemu\/(\d+)/)[1]);if(path.endsWith('/config'))return {agent:id===2?'enabled=0':'enabled=1,freeze-fs-on-backup=0'};if(id===4)throw Object.assign(Error('SECRET'),{providerStatus:403});if(id===5)throw Error('SECRET');return {result:{id:'ubuntu',name:'Ubuntu'}};});
 assert.deepEqual(result.guests.map(g=>g.status),['connected','disabled','stopped','permission','unavailable']);assert.ok(!calls.some(c=>c.init?.method));assert.ok(!calls.some(c=>/qemu\/(2|3)\/agent/.test(c.path)));assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!calls.some(c=>c.path.includes('/lxc/')));
});
test('invalid guest inventory cannot produce a successful empty discovery',async()=>{
 await assert.rejects(()=>guestConnections(async()=>({})),e=>e.status===502);
});
test('guest connection checks are owner-only and send no-store responses',async()=>{
 process.env.JWT_SECRET||='a'.repeat(64);process.env.JWT_REFRESH_SECRET||='b'.repeat(64);const {createApp}=await import('../src/app.js');let reads=0;
 const app=createApp({authenticate:(req,res,next)=>{req.user={sub:'fixture',role:req.headers['x-role']||'viewer'};next()},guestConnectionReader:async()=>{reads++;return {guests:[{id:'100',status:'connected'}]}}}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/connections/proxmox/guests`;
 try{for(const role of ['viewer','operator','admin'])assert.equal((await fetch(url,{headers:{'x-role':role}})).status,403);assert.equal(reads,0);const r=await fetch(url,{headers:{'x-role':'owner'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).guests[0].id,'100');assert.equal(reads,1)}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('background checks return promptly, share in-flight scans and discard results from changed connections',async()=>{
 const {createGuestConnectionReader}=await import('../src/guest-connections.js');let release,endpoint='one',calls=0;
 const read=createGuestConnectionReader({config:()=>({url:endpoint}),query:async(path,init,config)=>{calls++;assert.ok(['one','two'].includes(config.url));if(config.url==='one')await new Promise(r=>release=r);return []}});
 assert.equal(read().refreshing,true);assert.equal(read(true).refreshing,true);assert.equal(calls,1);endpoint='two';assert.equal(read().refreshing,true);await new Promise(r=>setTimeout(r,0));assert.equal(read().refreshing,false);release();await new Promise(r=>setTimeout(r,0));assert.equal(read().refreshing,false);assert.deepEqual(read().guests,[]);assert.equal(calls,2);
});

test('unknown, missing and paused power states never become stopped or trigger agent probes',async()=>{
 const calls=[];const states=['unknown',undefined,'paused','stopped','running'];
 const result=await guestConnections(async(path)=>{calls.push(path);if(path.startsWith('/cluster/resources'))return states.map((status,i)=>({vmid:i+1,node:'node02',type:'qemu',status}));if(path.endsWith('/config'))return {agent:'1'};return {result:{name:'Ubuntu'}}});
 assert.deepEqual(result.guests.map(g=>g.status),['power_unknown','power_unknown','power_unknown','stopped','connected']);
 assert.ok(!calls.some(path=>/qemu\/[123]\//.test(path)));
 assert.ok(result.guests.slice(0,3).every(g=>!g.detail.includes('Start this VM')));
});

test('guest setup excludes obsolete cluster guest references after a node is removed',async()=>{
 const calls=[];const result=await guestConnections(async path=>{calls.push(path);if(path.startsWith('/cluster/resources'))return [{type:'qemu',node:'node01',vmid:100,status:'running'},{type:'qemu',node:'node02',vmid:200,status:'running'}];if(path==='/nodes')return [{node:'node01',status:'online'}];if(path.endsWith('/config'))return {agent:1};return {result:{name:'Ubuntu'}}});
 assert.deepEqual(result.guests.map(g=>g.id),['100']);assert.deepEqual(result.errors,[]);assert.ok(!calls.some(p=>p.startsWith('/nodes/node02/')));
});
