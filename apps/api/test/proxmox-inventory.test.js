import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeNodeStorage} from '../src/proxmox-inventory.js';
test('per-node storage enriches unknown readings and retains separate node instances',()=>{
 const resources=[{id:'storage/node01/local',type:'storage',node:'node01',storage:'local',maxdisk:100,disk:40},{id:'storage/node02/local',type:'storage',node:'node02',storage:'local'}];
 mergeNodeStorage(resources,'node02',[{storage:'local',type:'dir',active:1,enabled:1,total:200,used:50,avail:150},{storage:'media',type:'nfs',active:0,total:0,used:0}]);
 assert.equal(resources.length,3);assert.equal(resources[0].maxdisk,100);assert.equal(resources[1].maxdisk,200);assert.equal(resources[1].available,150);assert.equal(resources[2].node,'node02');assert.equal(resources[2].status,'offline');
});

import {reconcileNodeInventory} from '../src/proxmox-inventory.js';
test('membership reconciliation distinguishes removed, offline and successfully empty inventory',()=>{
 const input=[{type:'node',node:'one',status:'online'},{type:'node',node:'two',status:'online'},{type:'qemu',node:'two',vmid:200},{type:'lxc',node:'three',vmid:300},{type:'storage',node:'three',storage:'old'}];
 const current=reconcileNodeInventory(input,[{node:'one',status:'online'},{node:'two',status:'offline'}]);assert.equal(current.resources.find(r=>r.node==='two'&&r.type==='node').status,'offline');assert.ok(current.resources.some(r=>r.vmid===200));assert.ok(!current.resources.some(r=>r.node==='three'));assert.equal(input[1].status,'online');assert.deepEqual(reconcileNodeInventory(input,[]).resources,[]);
 for(const value of [{},[null],[{status:'online'}]])assert.throws(()=>reconcileNodeInventory(input,value));
});
