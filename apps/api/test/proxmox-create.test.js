import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proxmoxCreateCt} from '../src/connectors.js';
test('CT creation allocates a fresh ID and creates a stopped unprivileged guest',async()=>{
 const calls=[];
 const result=await proxmoxCreateCt({name:'test-ct',node:'pve1',ostemplate:'local:vztmpl/debian.tar.zst',storage:'local-lvm',cores:2,memory:1024,disk:8,bridge:'vmbr0',sshKey:'ssh-ed25519 TEST'},async(path,init)=>{calls.push({path,init});return init?'UPID:pve1:create:':123;});
 assert.equal(result.vmid,'123');assert.match(result.task,/UPID/);
 assert.equal(calls[0].path,'/cluster/nextid');assert.equal(calls[1].path,'/nodes/pve1/lxc');
 const body=new URLSearchParams(calls[1].init.body);
 assert.equal(body.get('unprivileged'),'1');assert.equal(body.get('start'),'0');assert.equal(body.get('rootfs'),'local-lvm:8');assert.equal(body.get('ostemplate'),'local:vztmpl/debian.tar.zst');assert.equal(body.get('force'),null);assert.equal(body.get('ssh-public-keys'),'ssh-ed25519 TEST');
});
