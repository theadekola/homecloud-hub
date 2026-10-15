import test from 'node:test';import assert from 'node:assert/strict';
import {actionTarget,approvalTargetForPath,issueGrant,consumeGrant} from '../src/ssh-access.js';
import {proxmoxVmAction,proxmoxLxcAction,proxmoxCreateCt} from '../src/connectors.js';
import {assertGuestPlacement} from '../src/ssh-target.js';
import {validateBackupSelection} from '../src/backup-validation.js';
import {restoreArchive} from '../src/infrastructure.js';
import {taskInventory} from '../src/tasks.js';
const resources=[{type:'qemu',node:'pve1',vmid:101,status:'stopped'},{type:'lxc',node:'pve1',vmid:102,status:'stopped'}];
const stores=[{storage:'disk',active:1,enabled:1,type:'lvmthin',content:'images,rootdir',avail:100*1024**3},{storage:'backup',active:1,enabled:1,content:'backup'},{storage:'local',active:1,enabled:1,content:'vztmpl'}];
test('stopped VM and CT lifecycle use node approval and never require guest agent or guest SSH',async()=>{
 for(const [kind,id,run] of [['vm',101,proxmoxVmAction],['lxc',102,proxmoxLxcAction]]){
  const body={node:'pve1'},path=`/actions/proxmox/${kind}/${id}/start`;
  assert.equal(actionTarget({params:{provider:'proxmox',resourceType:kind,resourceId:String(id)},body}),'node:pve1');assert.equal(approvalTargetForPath(path,body),'node:pve1');
  const calls=[];const call=async(p,init)=>{calls.push({p,init});if(p==='/cluster/resources')return resources;return 'UPID:start';};
  assert.equal(await run('pve1',id,'start',body,call),'UPID:start');assert.deepEqual(calls.map(c=>c.p),['/cluster/resources',`/nodes/pve1/${kind==='vm'?'qemu':'lxc'}/${id}/status/start`]);
 }
});
test('node grants remain action-specific, single-use, and invalid for other guests or payloads',()=>{
 const body={node:'pve1'},path='/actions/proxmox/vm/101/start',token=issueGrant('alice','POST',path,body);
 assert.equal(consumeGrant(token,'alice','POST','/actions/proxmox/vm/102/start',body),false);assert.equal(consumeGrant(token,'alice','POST',path,body),false);
 assert.equal(approvalTargetForPath(path,{node:'../wrong'}),null);assert.equal(approvalTargetForPath('/actions/proxmox/vm/101/arbitrary',body),null);
});
test('migrated or wrong-type guest is rejected before any lifecycle write',async()=>{
 const calls=[];const call=async(p,init)=>{calls.push({p,init});return resources;};
 await assert.rejects(proxmoxVmAction('pve2',101,'start',{},call),{status:403});await assert.rejects(proxmoxLxcAction('pve1',101,'start',{},call),{status:403});assert.ok(calls.every(c=>!c.init));
 await assert.rejects(assertGuestPlacement('pve1','../101','qemu',call),{status:400});
});
test('backup selection validates node-specific storage content and guest placement',async()=>{
 const query=async p=>p==='/cluster/resources'?resources:stores;
 assert.deepEqual(await validateBackupSelection({node:'pve1',storage:'backup',vmid:'101, 102'},query),{node:'pve1',storage:'backup',vmid:'101,102'});
 for(const input of [{node:'pve1',storage:'disk',vmid:'101'},{node:'pve2',storage:'backup',vmid:'101'},{node:'pve1',storage:'backup',vmid:'999'},{node:'pve1',storage:'backup',vmid:'101,bad'}])await assert.rejects(validateBackupSelection(input,query),{status:400});
 await assert.rejects(validateBackupSelection({node:'pve1',storage:'backup',vmid:'101'},async p=>p==='/cluster/resources'?resources:stores.map(s=>({...s,active:0}))),/not available/);
});
const point={id:'archive-a',node:'pve1',storage:'backup',volid:'backup:backup/vzdump-qemu-101.vma.zst',type:'qemu'};
function restoreFixture({shared=false,visible=true,target=stores,guests=[]}={}){
 const calls=[];return {calls,archives:async()=>({points:[point]}),query:async p=>{
  calls.push({p});if(p==='/storage')return [{storage:'backup',shared:shared?1:0}];if(p==='/cluster/resources')return guests;
  if(p.includes('/content?'))return visible?[{volid:point.volid}]:[];return target;
 },write:async(p,method,body)=>{calls.push({p,method,body});return 'UPID:restore';}};
}
test('cross-node local archive restore is rejected before writes even when volume names could match',async()=>{
 const f=restoreFixture();await assert.rejects(restoreArchive(point.id,{vmid:500,node:'pve2',storage:'disk'},f),/source node/);assert.ok(f.calls.every(c=>!c.method));
});
test('shared source is verified on destination and restore never forces overwrite',async()=>{
 const f=restoreFixture({shared:true});assert.equal((await restoreArchive(point.id,{vmid:500,node:'pve2',storage:'disk'},f)).task,'UPID:restore');
 assert.ok(f.calls.some(c=>c.p==='/nodes/pve2/storage/backup/content?content=backup'));assert.equal(f.calls.at(-1).body.archive,point.volid);assert.equal(f.calls.at(-1).body.force,0);
 const missing=restoreFixture({shared:true,visible:false});await assert.rejects(restoreArchive(point.id,{vmid:500,node:'pve2',storage:'disk'},missing),/archive is unavailable/);assert.ok(missing.calls.every(c=>!c.method));
});
test('restore validates images/rootdir and rejects occupied IDs before mutation',async()=>{
 const bad=restoreFixture({target:[stores[1]]});await assert.rejects(restoreArchive(point.id,{vmid:500,storage:'backup'},bad),/support images/);assert.ok(bad.calls.every(c=>!c.method));
 const used=restoreFixture({guests:resources});await assert.rejects(restoreArchive(point.id,{vmid:101,storage:'disk'},used),{status:409});assert.ok(used.calls.every(c=>!c.method));
 const ct={...point,type:'lxc'};const calls=[];const f={...restoreFixture(),archives:async()=>({points:[ct]}),write:async(p,m,b)=>{calls.push({p,m,b});return 'UPID:ct-restore';}};await restoreArchive(point.id,{vmid:500,storage:'disk'},f);assert.equal(calls[0].p,'/nodes/pve1/lxc');assert.equal(calls[0].b.force,0);
});
test('all UI task periods, including 30 days, are accepted with bounded result coverage',async()=>{
 for(const hours of [1,24,168,720]){const calls=[];const result=await taskInventory(hours,async p=>{calls.push(p);return p==='/nodes'?[{node:'pve1'}]:[];});assert.deepEqual(result.tasks,[]);assert.match(calls[1],/limit=500&since=/);}
 await assert.rejects(taskInventory(721,async()=>[]),{status:400});
});
test('CT credential and template/storage errors prevent ID allocation and writes',async()=>{
 const base={name:'ct',node:'pve1',storage:'disk',ostemplate:'local:vztmpl/debian.tar.zst',password:'initial-root-password'};
 for(const [changes,templateFiles] of [[{password:''},[]],[{storage:'backup'},[]],[{ostemplate:'local:vztmpl/../bad'},[]],[{},[]]]){
  const calls=[];await assert.rejects(proxmoxCreateCt({...base,...changes},async(p,init)=>{calls.push({p,init});return p.endsWith('/storage')?stores:templateFiles;}),{status:400});assert.ok(calls.every(c=>!c.init&&c.p!=='/cluster/nextid'));
 }
});

import {proxmoxCtTemplates} from '../src/connectors.js';
test('CT template discovery is node-scoped, read-only and excludes unavailable storage',async()=>{
 const calls=[];const result=await proxmoxCtTemplates('pve1',async(p,init)=>{calls.push({p,init});if(p.endsWith('/storage'))return [...stores,{storage:'offline',active:0,content:'vztmpl'}];return [{content:'vztmpl',volid:'local:vztmpl/debian.tar.zst'},{content:'backup',volid:'local:backup/other'}];});
 assert.deepEqual(result.templates,[{volid:'local:vztmpl/debian.tar.zst',name:'debian.tar.zst',storage:'local'}]);assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.init&&c.p.startsWith('/nodes/pve1/')));
});

import {runBackupJob,backupArchives,retention} from '../src/infrastructure.js';
test('Run Now preserves saved backup behaviour and omits scheduler metadata',async()=>{
 const options={vmid:'101',storage:'backup',mode:'snapshot',compress:'zstd','prune-backups':'keep-last=7',protected:1,'notes-template':'{{guestname}}','notification-mode':'notification-system','notification-target':'admins',fleecing:'enabled=1,storage=disk',performance:'max-workers=2','pbs-change-detection-mode':'metadata',all:0};const calls=[];
 const result=await runBackupJob('job',{query:async()=>({...options,node:'pve1',id:'job',schedule:'daily',enabled:1,comment:'Metadata'}),write:async(p,m,b)=>{calls.push({p,m,b});return 'UPID:fixture'}});assert.equal(result.task,'UPID:fixture');assert.deepEqual(calls,[{p:'/nodes/pve1/vzdump',m:'POST',b:options}]);
});
test('archive discovery reports verified sharing while preserving source identities',async()=>{
 const query=async p=>p==='/nodes'?[{node:'pve1',status:'online'},{node:'pve2',status:'online'}]:p==='/storage'?[{storage:'backup',shared:1}]:p.endsWith('/storage?content=backup')?[{storage:'backup',active:1}]:[{volid:'backup:backup/fixture.vma.zst',subtype:'qemu',ctime:1700000000,size:100}];const result=await backupArchives(query);assert.equal(result.points.length,2);assert.ok(result.points.every(p=>p.shared));assert.notEqual(result.points[0].id,result.points[1].id);
 const unknown=await backupArchives(async p=>{if(p==='/storage')throw Error('denied');return query(p)});assert.ok(unknown.points.every(p=>!p.shared));assert.match(unknown.errors[0],/sharing configuration/);
});
test('retention rejects conflicting and repeated intervals before a provider call',()=>{for(const rule of ['keep-last=1,keep-last=7','keep-last=7,keep-last=7'])assert.throws(()=>retention(rule),/only once/);assert.equal(retention('keep-last=7,keep-weekly=4'),'keep-last=7,keep-weekly=4');});
