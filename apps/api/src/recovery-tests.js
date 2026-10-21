import crypto from 'node:crypto';
import {get,mutate} from './store.js';
import {pve} from './connectors.js';
import {restoreArchive,backupArchives,pveWrite,encode,httpError,integer} from './infrastructure.js';
export const riskyConfig=key=>/^(net\d+|hostpci\d+|usb\d+|serial\d+|parallel\d+|args|hookscript|ivshmem|virtiofs\d+)$/.test(key);
const physicalDisk=(key,value)=>/^(?:scsi|sata|ide|virtio|unused)\d+$/.test(key)&&typeof value==='string'&&(value.startsWith('/dev/')||value.startsWith('/run/')||value.startsWith('/mnt/'));
export function isolationPatch(config){const remove=Object.keys(config).filter(key=>riskyConfig(key)||physicalDisk(key,config[key]));return {onboot:0,...(remove.length?{delete:remove.join(',')}:{})};}
export function safeToBoot(config){return config&&config.onboot===0&&!Object.entries(config).some(([key,value])=>riskyConfig(key)||physicalDisk(key,value));}
export function createRecoveryTests({query=pve,write=pveWrite,restore=restoreArchive,archives=backupArchives,state=get,change=mutate}={}){
 const records=()=>state().recoveryTests||[];
 const find=id=>{const row=records().find(r=>r.id===id);if(!row)throw httpError('Recovery test not found',404);return row};
 const update=(id,patch)=>change(s=>{const row=(s.recoveryTests||[]).find(r=>r.id===id);if(row)Object.assign(row,patch,{updatedAt:new Date().toISOString()})});
 const verifyIdentity=async row=>{const config=await query(`/nodes/${encode(row.node)}/qemu/${row.vmid}/config`);if(config.description!==`i-Clusters recovery test ${row.id}`)throw httpError('Recovery guest identity changed; inspect it before continuing',409);return config};
 return {
  list:()=>({tests:records().slice(-100).reverse()}),
  async start(body,user){
   const point=(await archives()).points.find(p=>p.id===body.archiveId);if(!point||point.type!=='qemu')throw httpError('Select an accessible Proxmox VM archive. Container recovery tests are not yet supported.');
   const vmid=integer(body.vmid,'Unused test VM ID',100),id=crypto.randomUUID(),node=body.node||point.node;
   const row={id,node,vmid,archiveId:point.id,createdBy:user,createdAt:new Date().toISOString(),status:'restoring',dataVerified:false};
   if(records().filter(r=>!['failed','verified'].includes(r.status)).some(r=>r.node===node&&r.vmid===vmid))throw httpError('A recovery test already uses that VM ID',409);
   change(s=>{s.recoveryTests??=[];if(s.recoveryTests.length>=100)throw httpError('Recovery test record limit reached. Review retained records before creating more.',409);s.recoveryTests.push(row)});
   try{const result=await restore(point.id,{node,vmid,storage:body.storage,start:0,unique:true});update(id,{task:result.task});return {...row,task:result.task};}catch(e){update(id,{status:'failed',error:'Restore submission failed; inspect provider tasks before retrying.'});throw e;}
  },
  async isolate(id){const row=find(id);if(!['restoring','isolating'].includes(row.status))throw httpError('This recovery test is not awaiting isolation',409);
   const task=await query(`/nodes/${encode(row.node)}/tasks/${encode(row.task)}/status`);if(task.status!=='stopped'||task.exitstatus!=='OK')throw httpError('The restore task must finish successfully before isolation',409);
   const base=`/nodes/${encode(row.node)}/qemu/${row.vmid}`,status=await query(base+'/status/current');if(status.status!=='stopped')throw httpError('Stop the restored test VM before isolation',409);
   const config=await query(base+'/config');update(id,{status:'isolating'});
   await write(base+'/config','PUT',{...isolationPatch(config),description:`i-Clusters recovery test ${id}`,name:`restore-test-${row.vmid}`});
   const checked=await verifyIdentity(row);if(!safeToBoot(checked))throw httpError('Isolation could not be verified; do not boot this guest',409);update(id,{status:'isolated'});return {message:'Network and host-device connections removed. Test VM remains stopped.'};
  },
  async boot(id){const row=find(id);if(row.status!=='isolated')throw httpError('Verify isolation before starting the test VM',409);const config=await verifyIdentity(row);if(!safeToBoot(config))throw httpError('Test VM isolation changed. Inspect its configuration.',409);const task=await write(`/nodes/${encode(row.node)}/qemu/${row.vmid}/status/start`,'POST',{});update(id,{status:'boot-requested',bootTask:task});return {task,node:row.node};},
  async inspect(id){const row=find(id),config=await verifyIdentity(row),status=await query(`/nodes/${encode(row.node)}/qemu/${row.vmid}/status/current`);return {test:row,isolated:safeToBoot(config),guestStatus:status.status,dataVerified:row.dataVerified,note:'Running is not proof of application recovery. Use the guest console to inspect files, databases and services without reconnecting its network.'};},
  async attest(id,body,user){const row=find(id),config=await verifyIdentity(row);if(!safeToBoot(config))throw httpError('Recovery guest isolation changed',409);if(row.status!=='boot-requested'||body.files!==true||body.services!==true||typeof body.notes!=='string'||body.notes.trim().length<10||body.notes.length>2000)throw httpError('Record console checks for both files and services, with verification notes');const status=await query(`/nodes/${encode(row.node)}/qemu/${row.vmid}/status/current`);if(status.status!=='running')throw httpError('The test VM must be running for recovery verification',409);update(id,{status:'verified',dataVerified:true,verifiedBy:user,verifiedAt:new Date().toISOString(),notes:body.notes.trim()});return {message:'User-confirmed recovery evidence recorded. The isolated test VM is retained; stop and remove it explicitly when finished.'};}
 };
}
