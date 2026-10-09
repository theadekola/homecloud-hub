import test from 'node:test';
import assert from 'node:assert/strict';
import {shareInventory,shareInput,shareWrite,detectedShare} from '../src/shares.js';
test('shares retain protocol identity and distinguish remote mounts from exports',async()=>{
 const r=await shareInventory({truenasEnabled:true,proxmox:true,tn:async m=>m==='sharing.smb.query'?[{id:1,name:'media',path:'/mnt/tank/media',enabled:true}]:m==='sharing.nfs.query'?[{id:1,path:'/mnt/tank/media',enabled:false,ro:true,networks:['192.0.2.0/24']}]:[{id:3,service:'cifs',state:'RUNNING'}],query:async()=>[{type:'nfs',storage:'remote',server:'192.0.2.10',export:'/media',disable:1},{type:'dir',storage:'local'}]});
 assert.equal(r.resources.length,3);assert.equal(new Set(r.resources.map(s=>s.id)).size,3);assert.equal(r.resources[2].protocol,'NFS mount');assert.equal(r.resources[2].enabled,false);assert.equal(r.resources[0].readonly,null);assert.equal(r.services[0].state,'RUNNING');
});
test('one share query failure retains other protocols and records missing service status',async()=>{
 const r=await shareInventory({truenasEnabled:true,tn:async m=>{if(m==='sharing.nfs.query')return [{id:2,path:'/mnt/tank/nfs',enabled:true}];throw Error('denied')}});assert.equal(r.resources.length,1);assert.equal(r.errors.length,2);assert.equal(r.services.length,0);
});
test('share writes whitelist fields, reject unsafe paths and require NFS restrictions',()=>{
 assert.deepEqual(shareInput('smb',{name:'media',path:'/mnt/tank/media',enabled:true,guestok:true,options:{guest:true}}),{name:'media',path:'/mnt/tank/media',comment:'',enabled:true});
 for(const path of ['/etc','/mnt/../etc','/mnt/tank/./media'])assert.throws(()=>shareInput('smb',{name:'media',path}));assert.throws(()=>shareInput('nfs',{path:'/mnt/tank/media',networks:[]}));assert.throws(()=>shareInput('nfs',{path:'/mnt/tank/media',networks:['all']}));assert.throws(()=>shareInput('ftp',{}));
});
test('share actions use detected ID and existing directory, not caller-supplied arbitrary permissions path',async()=>{
 const calls=[];const tn=async(m,p)=>{calls.push([m,p]);if(m==='filesystem.stat')return {type:'DIRECTORY'};if(m.endsWith('.query'))return [{id:4,path:'/mnt/tank/media'}];return {id:4}};
 await shareWrite('smb',4,{name:'updated',path:'/mnt/tank/media',enabled:false},tn);assert.equal(calls.at(-1)[0],'sharing.smb.update');assert.equal(calls.at(-1)[1][0],4);
 assert.equal((await detectedShare('smb',4,tn)).path,'/mnt/tank/media');await assert.rejects(detectedShare('smb',5,tn),/not found/);await assert.rejects(shareWrite('smb',null,{name:'file',path:'/mnt/tank/file'},async()=>({type:'FILE'})),/existing directory/);
});
