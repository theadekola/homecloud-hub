import test from 'node:test';
import assert from 'node:assert/strict';
import {discovered} from '../src/discovery.js';
test('discovery uses actual Proxmox services and guest API inventory',()=>{
 const result=discovered({proxmox:{vms:[{id:'101',name:'vm01',node:'pve',type:'qemu',status:'running'}],lxc:[],nodeServices:[{id:'pve:sshd',name:'sshd',node:'pve',status:'running'}],guestInventory:{reports:[{id:'101',hostname:'vm01',node:'pve',services:[{name:'nginx',status:'running'}],containers:[],packages:[],source:'Proxmox guest API'}],limitations:[]}}});
 assert.equal(result.resources.length,3);assert.equal(result.resources[1].name,'sshd');assert.equal(result.resources[2].source,'Proxmox guest API');assert.equal(result.resources[2].node,'pve');
 assert.deepEqual(discovered({}).resources,[]);
});
