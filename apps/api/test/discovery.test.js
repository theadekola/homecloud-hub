import test from 'node:test';
import assert from 'node:assert/strict';
import {discovered} from '../src/discovery.js';
test('discovery uses actual Proxmox services and guest API inventory',()=>{
 const result=discovered({proxmox:{vms:[{id:'101',name:'vm01',node:'pve',type:'qemu',status:'running'}],lxc:[],nodeServices:[{id:'pve:sshd',name:'sshd',node:'pve',status:'running'}],guestInventory:{reports:[{id:'101',hostname:'vm01',node:'pve',services:[{name:'nginx',status:'running'}],containers:[],packages:[],source:'Proxmox guest API'}],limitations:[]}}});
 assert.equal(result.resources.length,3);assert.equal(result.resources[1].name,'sshd');assert.equal(result.resources[2].source,'Proxmox guest API');assert.equal(result.resources[2].node,'pve');
 assert.deepEqual(discovered({}).resources,[]);
});
test('LXC capability notes do not keep repaired VM discovery in an error state',()=>{
 const proxmox={lxc:[{id:'100',name:'ct01',node:'pve',type:'lxc',status:'running'}],guestInventory:{reports:[],limitations:[]}};
 const result=discovered({proxmox});
 assert.deepEqual(result.discoveryLimitations,[]);
 assert.equal(result.discoveryNotes.length,1);
 assert.match(result.discoveryNotes[0],/paired Proxmox node/);
 assert.equal(result.resources[0].kind,'LXC container');
 const failed=discovered({proxmox:{...proxmox,guestInventory:{reports:[],limitations:['VM 101: Proxmox HTTP 403']}}});
 assert.deepEqual(failed.discoveryLimitations,['VM 101: Proxmox HTTP 403']);
 assert.deepEqual(failed.discoveryNotes,result.discoveryNotes);
 assert.deepEqual(discovered({}).discoveryNotes,[]);
});
