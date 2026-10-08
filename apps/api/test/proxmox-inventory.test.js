import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeNodeStorage} from '../src/proxmox-inventory.js';
test('per-node storage enriches unknown readings and retains separate node instances',()=>{
 const resources=[{id:'storage/node01/local',type:'storage',node:'node01',storage:'local',maxdisk:100,disk:40},{id:'storage/node02/local',type:'storage',node:'node02',storage:'local'}];
 mergeNodeStorage(resources,'node02',[{storage:'local',type:'dir',active:1,enabled:1,total:200,used:50,avail:150},{storage:'media',type:'nfs',active:0,total:0,used:0}]);
 assert.equal(resources.length,3);assert.equal(resources[0].maxdisk,100);assert.equal(resources[1].maxdisk,200);assert.equal(resources[1].available,150);assert.equal(resources[2].node,'node02');assert.equal(resources[2].status,'offline');
});
