import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotInventory,guestSnapshot,snapshotName,guestBase} from '../src/snapshots.js';
test('inventory scans guests across nodes, excludes current, retains successes on failure',async()=>{
 const calls=[];const r=await snapshotInventory({proxmox:true,query:async path=>{calls.push(path);if(path.includes('resources'))return [{node:'one',type:'qemu',vmid:100,name:'app'},{node:'two',type:'lxc',vmid:200,name:'ct'}];if(path.includes('/two/'))throw Error('denied');return [{name:'current'},{name:'before',snaptime:1000,parent:'initial'}]}});
 assert.equal(r.targets.length,2);assert.equal(r.resources.length,1);assert.equal(r.resources[0].size,null);assert.equal(r.resources[0].created,new Date(1000000).toISOString());assert.match(r.errors[0],/two\/ct/);assert.ok(calls.includes('/nodes/two/lxc/200/snapshot'));
});
test('TrueNAS properties and schedules are source backed',async()=>{
 const r=await snapshotInventory({truenasEnabled:true,tn:async method=>method==='pool.snapshot.query'?[{id:'tank/app@before',properties:{used:{rawvalue:'1234'},creation:{rawvalue:'1000'}}}]:method==='pool.dataset.query'?[{id:'tank/app',name:'tank/app'}]:[{id:4,dataset:'tank/app',enabled:true}]});
 assert.equal(r.resources[0].size,1234);assert.equal(r.resources[0].dataset,'tank/app');assert.equal(r.targets[0].id,r.resources[0].targetId);assert.equal(r.schedules[0].id,4);
});
test('guest actions validate inputs and verify snapshot before rollback',async()=>{
 for(const n of ['current','../bad','bad/name',''])assert.throws(()=>snapshotName(n));assert.throws(()=>guestBase({node:'one',kind:'host',vmid:100}));
 const writes=[];const body={node:'one',kind:'lxc',vmid:200,name:'before'};
 assert.deepEqual(await guestSnapshot(body,'rollback',async()=>[{name:'before'}],async(...args)=>{writes.push(args);return 'UPID:test'}),{task:'UPID:test'});
 assert.equal(writes[0][0],'/nodes/one/lxc/200/snapshot/before/rollback');
 await assert.rejects(guestSnapshot(body,'delete',async()=>[],async()=>{}),/not found/);
});
