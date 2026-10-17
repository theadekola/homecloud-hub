import test from 'node:test';import assert from 'node:assert/strict';import {storageInventory} from '../src/storage.js';
test('storage inventory exposes endpoint fields without credentials and normalizes unavailable totals',async()=>{
 const data=await storageInventory(async path=>path==='/nodes'?[{node:'pve1'}]:path==='/storage'?[{storage:'nas',type:'nfs',shared:'0',server:'192.0.2.1',export:'/backups',password:'secret',username:'private'},{storage:'local',path:'/mnt/backup'}]:[{storage:'nas',active:'0',enabled:'1',total:0,used:0,avail:0,content:'backup'},{storage:'local',active:true,enabled:true,total:100,used:0,avail:100,content:'backup'}]);
 assert.equal(data.coverage.complete,true);const [nas,local]=data.resources;
 assert.equal(nas.status,'offline');assert.equal(nas.shared,false);assert.equal(nas.capacity,null);assert.equal(nas.used,null);assert.equal(nas.available,null);assert.equal(nas.server,'192.0.2.1');assert.equal(nas.export,'/backups');assert.equal('password' in nas,false);assert.equal('username' in nas,false);
 assert.equal(local.path,'/mnt/backup');assert.equal(local.status,'online');assert.equal(local.used,0);assert.equal(local.usage,0);
});
test('bad storage configuration remains partial while node inventory remains readable',async()=>{
 const data=await storageInventory(async path=>path==='/nodes'?[{node:'pve1'}]:path==='/storage'?{}:[{storage:'local',total:100,used:150,avail:-1,active:1,content:'backup'}]);
 assert.equal(data.resources.length,1);assert.equal(data.coverage.complete,false);assert.equal(data.errors.length,1);assert.equal(data.resources[0].used,null);assert.equal(data.resources[0].available,null);
});
test('disabled configuration takes precedence over active node state',async()=>{
 const data=await storageInventory(async path=>path==='/nodes'?[{node:'pve1'}]:path==='/storage'?[{storage:'local',disable:'1',shared:'1'}]:[{storage:'local',active:1,total:100,used:20,avail:80,content:'backup'}]);
 assert.equal(data.resources[0].status,'disabled');assert.equal(data.resources[0].shared,true);
});

test('destination inventory cannot establish zero storage without visible nodes',async()=>{
 const data=await storageInventory(async()=>[]);assert.equal(data.coverage.complete,false);assert.ok(data.errors.length);
 for(const nodes of [[{}],[null],[{node:''}]])await assert.rejects(()=>storageInventory(async()=>nodes),{status:502});
});
