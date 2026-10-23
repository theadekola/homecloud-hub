import test from 'node:test';import assert from 'node:assert/strict';
import {storageInventory,storageSummary} from '../src/storage.js';
import {networkInventory} from '../src/network.js';
import {taskInventory} from '../src/tasks.js';

test('storage network and tasks isolate an offline member and recover without cached failure',async()=>{
 let recovered=false;let calls=[];
 const query=async path=>{
  calls.push(path);
  if(path==='/nodes')return [{node:'available',status:'online'},{node:'returning',status:recovered?'online':'offline'}];
  if(path==='/storage')return [{storage:'local',type:'dir',shared:0}];
  if(path.endsWith('/storage'))return [{storage:'local',active:1,enabled:1,total:100,used:30,avail:70}];
  if(path.endsWith('/network'))return [{iface:'vmbr0',active:1,cidr:'192.0.2.1/24'}];
  if(path.includes('/tasks?'))return [{upid:path,starttime:10,type:'vzdump',status:'OK'}];
  throw Error('Unexpected request '+path);
 };
 for(const collect of [()=>storageInventory(query),()=>networkInventory(query,()=>[]),()=>taskInventory(24,query)]){
  recovered=false;calls=[];const partial=await collect();assert.ok(partial.errors.some(e=>e.includes('returning')));assert.ok(!calls.some(p=>p.startsWith('/nodes/returning/')));assert.equal(partial.coverage.complete,false);
  if(partial.resources){assert.equal(partial.resources.find(r=>r.node==='available').used,30);const summary=storageSummary(partial.resources.map(r=>({...r,provider:'proxmox'})),partial.coverage);assert.equal(summary.capacity,null);assert.equal(summary.measuredCapacity,100);assert.equal(summary.measuredUsed,30);assert.equal(summary.measuredAvailable,70);}
  if(partial.interfaces)assert.equal(partial.interfaces[0].node,'available');if(partial.tasks)assert.equal(partial.tasks[0].node,'available');
  recovered=true;calls=[];const full=await collect();assert.deepEqual(full.errors,[]);assert.equal(full.coverage.complete,true);assert.ok(calls.some(p=>p.startsWith('/nodes/returning/')));
 }
});
