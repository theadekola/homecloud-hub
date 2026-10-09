import test from 'node:test';
import assert from 'node:assert/strict';
import {datasetInventory,normalizeDataset,datasetCreateInput,datasetRoot,datasetPermissionsInput} from '../src/datasets.js';
test('normalization keeps inherited free space separate from quota and volume size',()=>{
 const d=normalizeDataset({id:'tank/media',name:'tank/media',type:'FILESYSTEM',used:{parsed:100},available:{parsed:900},quota:{parsed:0},usedbydataset:{parsed:40},compression:{value:'lz4'}});
 assert.equal(d.size,null);assert.equal(d.usedByDataset,40);assert.equal(d.compression,'lz4');assert.equal(d.available,900);
 assert.equal(normalizeDataset({name:'tank/vol',type:'VOLUME',volsize:{parsed:2048}}).size,2048);
});
test('shared volumes are deduplicated and offline pools are not queried',async()=>{
 const calls=[];const result=await datasetInventory({proxmox:true,inventory:async()=>({errors:[],resources:[{node:'one',name:'nfs',shared:true,status:'online'},{node:'two',name:'nfs',shared:true,status:'online'},{node:'off',name:'local',status:'offline'}]}),query:async p=>{calls.push(p);return [{volid:'nfs:vm-100-disk-0',content:'images',size:100},{volid:'nfs:test.iso',content:'iso',size:80}];}});
 assert.equal(result.resources.length,1);assert.equal(result.resources[0].type,'VM Volume');assert.equal(result.resources[0].used,null);assert.equal(calls.length,2);
});
test('per-node volume failures retain successful resources',async()=>{
 const r=await datasetInventory({proxmox:true,inventory:async()=>({errors:[],resources:[{node:'one',name:'local',status:'online'},{node:'two',name:'local',status:'online'}]}),query:async p=>{if(p.includes('/two/'))throw Error('Denied');return [{volid:'local:subvol-1',content:'rootdir',size:100}];}});
 assert.equal(r.resources.length,1);assert.equal(r.errors.length,1);
});
test('create validates ZFS volume alignment, quota and allowed properties',()=>{
 assert.equal(datasetCreateInput({name:'tank/vol',type:'VOLUME',volsize:1024**3}).volblocksize,'16K');
 assert.throws(()=>datasetCreateInput({name:'tank/vol',type:'VOLUME',volsize:100}),/Volume size/);
 assert.throws(()=>datasetCreateInput({name:'tank/fs',quota:-1}),/Quota/);
 assert.throws(()=>datasetCreateInput({name:'tank'}),/pool\/dataset/);
 assert.throws(()=>datasetCreateInput({name:'tank/../fs'}),/pool\/dataset/);
 assert.throws(()=>datasetCreateInput({name:'tank/fs',compression:'invalid'}),/compression/);
 assert.equal(datasetCreateInput({name:'tank/fs',ignored:'not forwarded'}).ignored,undefined);
});
test('permission changes preserve ACLs and do not traverse children',()=>{
 const p=datasetPermissionsInput({mode:'750',uid:1000,recursive:true,stripacl:true},'/mnt/tank/fs');
 assert.equal(p.uid,1000);assert.deepEqual(p.options,{recursive:false,traverse:false,stripacl:false});
 assert.throws(()=>datasetPermissionsInput({mode:'999'},'/mnt/tank/fs'),/octal/);
 assert.throws(()=>datasetPermissionsInput({mode:'750',gid:-1},'/mnt/tank/fs'),/numeric ID/);
});
test('browse and permissions are bound to an unlocked detected filesystem',async()=>{
 const tn=async()=>[{id:'tank/fs',type:'FILESYSTEM',mountpoint:{value:'/mnt/tank/fs'}}];
 assert.equal(await datasetRoot('tank/fs',tn),'/mnt/tank/fs');
 await assert.rejects(()=>datasetRoot('absent',tn),/mountpoint/);
 await assert.rejects(()=>datasetRoot('tank/fs',async()=>[{id:'tank/fs',type:'VOLUME',mountpoint:'/mnt/tank/fs'}]),/mountpoint/);
 await assert.rejects(()=>datasetRoot('tank/fs',async()=>[{id:'tank/fs',type:'FILESYSTEM',locked:true,mountpoint:'/mnt/tank/fs'}]),/mountpoint/);
});
