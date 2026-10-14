import test from 'node:test';import assert from 'node:assert/strict';
import {createStorage} from '../src/storage.js';import {networkWrite} from '../src/network.js';
test('CephFS default uses supported file content and rejects disks before provider writes',async()=>{
 const calls=[],write=async(...a)=>{calls.push(a);return null};await createStorage({type:'cephfs',storage:'ceph-test'},write);
 assert.equal(calls[0][2].content,'iso,vztmpl,backup,snippets');assert.throws(()=>createStorage({type:'cephfs',storage:'test',content:'images'},write),/CephFS/);assert.equal(calls.length,1);
 await createStorage({type:'lvmthin',storage:'thin',vgname:'vg',thinpool:'pool'},write);assert.equal(calls[1][2].content,'images,rootdir');
});
test('network clearing is explicit, allowlisted, edit-only and rejects conflicts before writes',async()=>{
 const calls=[],write=async(...a)=>{calls.push(a);return null};await networkWrite('n1',{iface:'vmbr0',type:'bridge',gateway:'',cidr:'',comments:'',clear:['gateway','cidr','comments']},true,write);assert.equal(calls[0][2].delete,'gateway,cidr,comments');assert.equal(calls[0][1],'PUT');
 await networkWrite('n1',{iface:'vmbr0',type:'bridge',gateway:''},true,write);assert.equal(calls[1][2].delete,undefined);
 for(const [input,edit] of [[{clear:['type']},true],[{clear:'gateway'},true],[{clear:['gateway'],gateway:'192.0.2.1'},true],[{clear:['gateway']},false]])assert.throws(()=>networkWrite('n1',{iface:'vmbr0',type:'bridge',...input},edit,write),/Invalid network fields/);assert.equal(calls.length,2);
});
