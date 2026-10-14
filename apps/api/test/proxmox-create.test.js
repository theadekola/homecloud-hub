import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proxmoxCreateCt} from '../src/connectors.js';
test('CT creation validates template/root storage, allocates a fresh ID and provisions a stopped unprivileged guest',async()=>{
 const calls=[];const password='fixture-root-password';
 const result=await proxmoxCreateCt({name:'test-ct',node:'pve1',ostemplate:'local:vztmpl/debian.tar.zst',storage:'local-lvm',cores:2,memory:1024,disk:8,bridge:'vmbr0',password,sshKey:'ssh-ed25519 TEST'},async(path,init)=>{
  calls.push({path,init});if(path.endsWith('/storage'))return [{storage:'local-lvm',active:1,enabled:1,content:'rootdir'},{storage:'local',active:1,enabled:1,content:'vztmpl'}];
  if(path.includes('/content'))return [{content:'vztmpl',volid:'local:vztmpl/debian.tar.zst'}];return init?'UPID:pve1:create:':123;
 });
 assert.equal(result.vmid,'123');assert.match(result.task,/UPID/);
 assert.equal(calls[2].path,'/cluster/nextid');assert.equal(calls[3].path,'/nodes/pve1/lxc');
 const body=new URLSearchParams(calls[3].init.body);
 assert.equal(body.get('unprivileged'),'1');assert.equal(body.get('start'),'0');assert.equal(body.get('onboot'),'0');assert.equal(body.get('rootfs'),'local-lvm:8');assert.equal(body.get('password'),password);assert.equal(body.get('ostemplate'),'local:vztmpl/debian.tar.zst');assert.equal(body.get('force'),null);assert.equal(body.get('ssh-public-keys'),'ssh-ed25519 TEST');assert.equal(JSON.stringify(result).includes(password),false);
});

import {proxmoxCreateVm,proxmoxInstallationMedia} from '../src/connectors.js';
const vm={name:'linux-install',node:'pve1',storage:'local-lvm',iso:'local:iso/debian.iso',cores:2,memory:4096,disk:40,bridge:'vmbr0'};
const stores=[{storage:'local-lvm',active:1,enabled:1,content:'images,rootdir',avail:100*1024**3},{storage:'local',active:1,enabled:1,content:'iso,vztmpl'}];
function fixture({storage=stores,files=[{content:'iso',volid:vm.iso}],failContent=false}={}){
 const calls=[];const call=async(path,init)=>{calls.push({path,init});if(path.endsWith('/storage'))return storage;if(path.includes('/content')){if(failContent)throw new Error('Permission denied');return files;}if(path==='/cluster/nextid')return 321;if(path==='/nodes/pve1/qemu'&&init?.method==='POST')return 'UPID:create';throw new Error(`Unexpected call ${path}`);};return {call,calls};
}
test('VM ISO creation validates node storage and attaches a CD-ROM before allocating a fresh stopped VM',async()=>{
 const f=fixture(),result=await proxmoxCreateVm({...vm,vmid:100,onboot:true},f.call);
 assert.deepEqual(result,{vmid:'321',node:'pve1',task:'UPID:create',installationReady:true});
 assert.deepEqual(f.calls.map(c=>c.path),['/nodes/pve1/storage','/nodes/pve1/storage/local/content?content=iso','/cluster/nextid','/nodes/pve1/qemu']);
 const body=new URLSearchParams(f.calls.at(-1).init.body);
 assert.equal(body.get('ide2'),'local:iso/debian.iso,media=cdrom');assert.equal(body.get('boot'),'order=ide2;scsi0');assert.equal(body.get('scsi0'),'local-lvm:40');assert.equal(body.get('vmid'),'321');assert.equal(body.get('start'),'0');assert.equal(body.get('onboot'),'0');assert.equal(body.get('agent'),'1');assert.equal(body.get('force'),null);
});
test('disk-first ISO and SATA compatibility produce matching boot devices',async()=>{
 const f=fixture();await proxmoxCreateVm({...vm,bootOrder:'disk-first',diskBus:'sata'},f.call);const body=new URLSearchParams(f.calls.at(-1).init.body);
 assert.equal(body.get('boot'),'order=sata0;ide2');assert.equal(body.get('sata0'),'local-lvm:40');assert.equal(body.get('scsi0'),null);assert.equal(body.get('scsihw'),null);
});
test('empty VM creation remains supported with disk-only boot',async()=>{
 const f=fixture();const result=await proxmoxCreateVm({...vm,iso:''},f.call);const body=new URLSearchParams(f.calls.at(-1).init.body);
 assert.equal(result.installationReady,false);assert.equal(body.get('ide2'),null);assert.equal(body.get('boot'),'order=scsi0');assert.equal(f.calls.some(c=>c.path.includes('/content')),false);
});
test('invalid storage, missing media and invalid inputs never allocate or mutate a VM',async()=>{
 const cases=[
  [{storage:'other'}, {}, /disk storage/],
  [{}, {storage:stores.map(s=>({...s,active:0}))}, /disk storage/],
  [{}, {storage:stores.map(s=>({...s,enabled:0}))}, /disk storage/],
  [{}, {storage:stores.map(s=>({...s,content:'backup'}))}, /disk storage/],
  [{}, {storage:[{...stores[0],avail:1},stores[1]]}, /free space/],
  [{}, {storage:[stores[0],{...stores[1],content:'images'}]}, /ISO storage/],
  [{}, {files:[]}, /no longer available/],
  [{}, {failContent:true}, /Permission denied/],
  [{iso:'local:iso/debian.iso,media=disk'}, {}, /Invalid ISO/],
  [{iso:'local:iso/../debian.iso'}, {}, /Invalid ISO/],
  [{bridge:'vmbr0,firewall=0'}, {}, /network bridge/],
  [{node:'../pve1'}, {}, /node/],
  [{bootOrder:'network-first'}, {}, /boot/],
  [{iso:'',bootOrder:'cdrom-first'}, {}, /boot/],
  [{diskBus:'ide'}, {}, /controller/],
  [{memory:0}, {}, /Memory/],
  [{cores:1.5}, {}, /Cores/],
  [{disk:0}, {}, /Disk/]
 ];
 for(const [changes,options,pattern] of cases){const f=fixture(options);await assert.rejects(proxmoxCreateVm({...vm,...changes},f.call),pattern);assert.equal(f.calls.some(c=>c.init),false);assert.equal(f.calls.some(c=>c.path==='/cluster/nextid'),false);}
});
test('ISO discovery is node-specific, excludes inactive stores and retains partial errors',async()=>{
 const f=fixture({storage:[...stores,{storage:'offline',active:0,content:'iso'}],files:[{content:'iso',volid:vm.iso,size:42},{content:'backup',volid:'local:backup/file.iso'},{content:'iso',volid:'other:iso/file.iso'}]});
 const result=await proxmoxInstallationMedia('pve1',f.call);assert.deepEqual(result,{node:'pve1',isos:[{volid:vm.iso,storage:'local',name:'debian.iso',size:42}],errors:[]});assert.equal(f.calls.length,2);assert.ok(f.calls.every(c=>!c.init));
 const denied=await proxmoxInstallationMedia('pve1',fixture({failContent:true}).call);assert.deepEqual(denied.isos,[]);assert.match(denied.errors[0],/Permission denied/);
});
