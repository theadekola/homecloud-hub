import {runtimeEnvironment} from './runtime-configuration.js';
import {validateBackupSelection} from './backup-validation.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import WebSocket from 'ws';
import { pve,request } from './connectors.js';

export const encode=encodeURIComponent;
export const httpError=(message,status=400)=>Object.assign(new Error(message),{status});
export function required(value,name){if(typeof value!=='string'||!value.trim())throw httpError(`${name} is required`);return value.trim();}
export function integer(value,name,min=1,max=999999999){const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw httpError(`${name} must be an integer from ${min} to ${max}`);return n;}
export function retention(value){
  if(typeof value!=='string'||!/^keep-(last|hourly|daily|weekly|monthly|yearly)=\d+(,keep-(last|hourly|daily|weekly|monthly|yearly)=\d+)*$/.test(value))throw httpError('Use a retention rule such as keep-last=7,keep-weekly=4');
  if(!value.split(',').some(pair=>Number(pair.split('=')[1])>0))throw httpError('Retention must keep at least one backup');
  const keys=value.split(',').map(pair=>pair.split('=')[0]);
  if(new Set(keys).size!==keys.length)throw httpError('Each retention interval can appear only once');
  return value;
}
export const pveWrite=(path,method,body)=>pve(path,{method,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(Object.entries(body).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)]))});
export async function backupJobs(){return pve('/cluster/backup');}
export async function createBackupJob(body){
  const node=required(body.node,'Node'),storage=required(body.storage,'Backup storage');
  const vmid=required(String(body.vmid||''),'VM/container IDs');
  const selection=await validateBackupSelection({node,storage,vmid},pve);
  const id=`homecloud-${crypto.randomUUID()}`;
  await pveWrite('/cluster/backup','POST',{id,node,storage,vmid:selection.vmid,comment:required(body.name,'Name'),schedule:required(body.schedule,'Proxmox calendar schedule'),enabled:1,mode:'snapshot',compress:'zstd',...(body.retention?{'prune-backups':retention(body.retention)}:{})});
  return {id};
}
export async function runBackupJob(id,{query=pve,write=pveWrite}={}){
  const job=await query(`/cluster/backup/${encode(id)}`);
  if(!job.node)throw httpError('Choose a node-specific job to run from HomeCloud Hub; cluster-wide jobs run through the Proxmox scheduler');
  const options={};
  for(const key of ['vmid','all','exclude','pool','storage','mode','compress','bwlimit','ionice','mailto','mailnotification','prune-backups','protected','notes-template','notification-mode','notification-target','fleecing','performance','pbs-change-detection-mode'])if(job[key]!=null)options[key]=job[key];
  if(!options.vmid&&!options.all&&!options.pool)throw httpError('Job has no guest selection');
  return {node:job.node,task:await write(`/nodes/${encode(job.node)}/vzdump`,'POST',options)};
}
export async function toggleBackupJob(id){const job=await pve(`/cluster/backup/${encode(id)}`);await pveWrite(`/cluster/backup/${encode(id)}`,'PUT',{enabled:job.enabled===0||job.enabled===false?1:0});}
export async function backupArchives(query=pve){
  const nodes=await query('/nodes');
  if(!Array.isArray(nodes)||nodes.some(n=>!n||typeof n.node!=='string'||!n.node))throw httpError('Unexpected backup node inventory',502);
  const points=[],errors=[],coverage={nodes:nodes.length,checkedNodes:0,visibleStorage:0,checkedStorage:0,issues:[]};let configs=[];
  if(!nodes.length)errors.push('No Proxmox nodes are visible to the backup inventory. Check the API token permissions.');
  try{configs=await query('/storage');if(!Array.isArray(configs))throw Error('Invalid storage configuration');}catch(e){configs=[];errors.push(`Storage sharing configuration: ${e.message}`);}
  await Promise.all(nodes.map(async n=>{
    if(n.status!=='online'){errors.push(`${n.node}: node is ${n.status||'unavailable'}; its backup archives were not checked.`);return;}
    let stores;
    try{stores=await query(`/nodes/${encode(n.node)}/storage?content=backup`);if(!Array.isArray(stores)||stores.some(s=>!s||typeof s.storage!=='string'||!s.storage))throw Error('Unexpected backup storage inventory');coverage.checkedNodes++;}catch(e){errors.push(`${n.node}: ${e.message}`);return;}
    coverage.visibleStorage+=stores.length;
    await Promise.all(stores.map(async store=>{
      if(![1,true,'1'].includes(store.active)||[0,false,'0'].includes(store.enabled)){const message=`${n.node}/${store.storage}: backup storage is inactive, disabled or unavailable; archives were not checked.`,config=configs.find(c=>c.storage===store.storage),mount=config?.type==='dir'&&[1,true,'1'].includes(config.is_mountpoint);errors.push(message);coverage.issues.push({code:'storage-unavailable',node:n.node,storage:store.storage,message,help:mount?`Confirm ${config.path||'the configured directory'} is mounted on ${n.node}, then retry inventory. Do not disable the mount-point check or write backups into an unmounted directory.`:'Check that this storage is enabled, online and accessible on this node in Proxmox, then retry inventory.'});return;}
      try{const files=await query(`/nodes/${encode(n.node)}/storage/${encode(store.storage)}/content?content=backup`);
        if(!Array.isArray(files)||files.some(f=>!f||typeof f.volid!=='string'||!f.volid))throw Error('Unexpected backup archive inventory');
        coverage.checkedStorage++;
        for(const f of files)points.push({id:Buffer.from(JSON.stringify({node:n.node,storage:store.storage,volid:f.volid})).toString('base64url'),provider:'proxmox',node:n.node,storage:store.storage,shared:(store.shared??configs.find(c=>c.storage===store.storage)?.shared)===1||(store.shared??configs.find(c=>c.storage===store.storage)?.shared)===true,volid:f.volid,name:f.volid,type:f.subtype||(/vzdump-lxc/.test(f.volid)?'lxc':'qemu'),vmid:f.vmid??null,created:f.ctime?new Date(f.ctime*1000).toISOString():null,size:f.size??null,protected:Boolean(f.protected)});
      }catch(e){errors.push(`${n.node}/${store.storage}: ${e.message}`);}
    }));
  }));
  return {points,errors,coverage:{...coverage,complete:errors.length===0}};
}
export async function restoreArchive(id,body,{query=pve,archives=backupArchives,write=pveWrite}={}){
  const inventory=await archives();const point=inventory.points.find(p=>p.id===id);
  if(!point)throw httpError('Backup archive not found or inaccessible',404);
  const vmid=integer(body.vmid,'New VM/container ID',100);
  const storage=required(body.storage,'Destination storage');
  const node=required(body.node||point.node,'Destination node');
  const content=point.type==='lxc'?'rootdir':point.type==='qemu'?'images':null;
  if(!content)throw httpError('Unknown backup type');
  // Volume IDs for local storage are node-scoped. A matching name alone is not shared-source evidence.
  if(node!==point.node){
    const configs=await query('/storage'),source=Array.isArray(configs)&&configs.find(s=>s.storage===point.storage);
    if(!(source?.shared===1||source?.shared===true))throw httpError('Local backup archives must be restored on their source node');
    const sourceStores=await query(`/nodes/${encode(node)}/storage`),sourceStore=Array.isArray(sourceStores)&&sourceStores.find(s=>s.storage===point.storage);
    if(!sourceStore||sourceStore.active!==1||sourceStore.enabled===0||!String(sourceStore.content||'').split(',').includes('backup'))throw httpError('Shared backup storage is unavailable on the destination node');
    const volumes=await query(`/nodes/${encode(node)}/storage/${encode(point.storage)}/content?content=backup`);
    if(!Array.isArray(volumes)||!volumes.some(v=>v.volid===point.volid))throw httpError('Selected backup archive is unavailable on the destination node');
  }
  const stores=await query(`/nodes/${encode(node)}/storage`),destination=Array.isArray(stores)&&stores.find(s=>s.storage===storage);
  if(!destination||destination.active!==1||destination.enabled===0||!String(destination.content||'').split(',').includes(content))throw httpError(`Destination storage must be active and support ${content} on the selected node`);
  if(content==='images'&&['iscsi','iscsidirect'].includes(destination.type))throw httpError('Destination storage cannot allocate a new VM disk');
  // Never overwrite an existing guest. The provider also checks for concurrent allocation.
  const resources=await query('/cluster/resources');
  if(resources.some(r=>Number(r.vmid)===vmid))throw httpError('That VM ID already exists; choose an unused ID',409);
  if(point.type==='lxc')return {node,task:await write(`/nodes/${encode(node)}/lxc`,'POST',{vmid,ostemplate:point.volid,storage,restore:1,force:0})};
  if(point.type!=='qemu')throw httpError('Unknown backup type');
  return {node,task:await write(`/nodes/${encode(node)}/qemu`,'POST',{vmid,archive:point.volid,storage,force:0})};
}
export function truenasConfigured(env=runtimeEnvironment()){return Boolean(env.TRUENAS_URL&&env.TRUENAS_API_KEY);}
export async function truenas(method,params=[],env=runtimeEnvironment()){
  try{return await truenasCall(method,params,env);}catch(error){
    if(method.startsWith('pool.snapshot.')&&(error.code===-32601||/method.*not found|method.*does not exist/i.test(error.message)))return truenasCall(method.replace('pool.snapshot.','zfs.snapshot.'),params,env);
    throw error;
  }
}
async function truenasCall(method,params=[],env=runtimeEnvironment()){
  if(!truenasConfigured(env))throw httpError('TrueNAS is not configured',503);
  const base=new URL(env.TRUENAS_URL);
  if(base.protocol!=='https:')throw httpError('TrueNAS requires an HTTPS URL');
  const legacy=env.TRUENAS_API_MODE==='legacy';
  const target=new URL(env.TRUENAS_WS_PATH||(legacy?'/websocket':'/api/current'),base);target.protocol='wss:';
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(target,{ca:env.TRUENAS_CA_PEM|| (env.TRUENAS_TLS_CA?fs.readFileSync(env.TRUENAS_TLS_CA):undefined),rejectUnauthorized:true,maxPayload:32*1024*1024});
    let finished=false;
    const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);ws.close();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>{finish(new Error('TrueNAS request timed out'));ws.terminate();},Number(process.env.CONNECTOR_TIMEOUT_MS)||15000);
    ws.on('error',error=>finish(error));ws.on('close',()=>{if(!finished)finish(new Error('TrueNAS closed the connection'));});
    const send=(id,method,params)=>ws.send(JSON.stringify(legacy?{msg:'method',id:String(id),method,params}:{jsonrpc:'2.0',id,method,params}));
    ws.on('open',()=>legacy?ws.send(JSON.stringify({msg:'connect',version:'1',support:['1']})):send(1,'auth.login_with_api_key',[env.TRUENAS_API_KEY]));
    ws.on('message',raw=>{
      let message;try{message=JSON.parse(raw.toString())}catch{return finish(new Error('Invalid TrueNAS response'));}
      if(legacy&&message.msg==='ping'){ws.send(JSON.stringify({msg:'pong',id:message.id}));return;}
      if(legacy&&message.msg==='connected'){send(1,'auth.login_with_api_key',[env.TRUENAS_API_KEY]);return;}
      if(legacy&&message.msg==='failed')return finish(new Error('TrueNAS legacy protocol rejected'));
      if(Number(message.id)!==1&&Number(message.id)!==2)return;
      if(message.error)return finish(Object.assign(new Error(Number(message.id)===1?'TrueNAS authentication rejected':message.error.data?.reason||message.error.reason||message.error.message||'TrueNAS API error'),{code:message.error.code}));
      if(Number(message.id)===1){if(message.result!==true)return finish(new Error('TrueNAS authentication rejected'));send(2,legacy?method.replace('pool.snapshot.','zfs.snapshot.'):method,params);}
      else finish(null,message.result);
    });
  });
}
export async function truenasSnapshot(){
  const info=await truenas('system.info');const errors=[];
  const query=async(method,params=[])=>{try{return await truenas(method,params);}catch(e){errors.push(`${method}: ${e.message}`);return [];}};
  const [pools,datasets,snapshots,disks,alerts,jobs,schedules]=await Promise.all([
    query('pool.query'),query('pool.dataset.query',[[],{extra:{flat:true}}]),query('pool.snapshot.query',[[],{limit:1000}]),query('disk.query'),query('alert.list'),query('core.get_jobs',[[],{limit:100}]),query('pool.snapshottask.query')]);
  const number=v=>{if(v==null)return null;const n=Number(v?.parsed??v?.rawvalue??v?.value??v);return Number.isFinite(n)?n:null;};
  return {info,pools:pools.map(p=>{const root=datasets.find(d=>d.name===p.name);const used=number(root?.used),available=number(root?.available);return {id:String(p.id),provider:'truenas',name:p.name,type:'ZFS',status:p.status,used,available,capacity:used==null||available==null?null:used+available,usage:used==null||available==null?null:Math.round(used/(used+available)*100)};}),
    datasets:datasets.map(d=>({id:d.id,name:d.name,type:d.type,used:number(d.used),available:number(d.available),mountpoint:d.mountpoint?.value??null})),
    snapshots:snapshots.map(s=>({id:s.id,name:s.name||s.id,dataset:s.dataset,created:s.properties?.creation?.value??null,provider:'truenas',type:'snapshot'})),
    disks:disks.map(d=>({id:d.identifier||d.name,name:d.name,model:d.model,serial:d.serial,size:d.size,type:d.type})),alerts,jobs,schedules,errors};
}
export async function extraServices(){
  const configured=JSON.parse(process.env.SERVICE_CHECKS_JSON||'[]');
  if(!Array.isArray(configured))throw new Error('SERVICE_CHECKS_JSON must be an array');
  return Promise.all(configured.map(async check=>{
    const start=Date.now();
    try{const target=new URL(check.url);if(!['http:','https:'].includes(target.protocol)||target.username||target.password)throw new Error('Invalid service URL');
      const response=await request(target.toString(),{method:'GET'});return {name:check.name,status:response.ok?'reachable':'error',response:Date.now()-start,httpStatus:response.status};
    }catch(e){return {name:check.name,status:'error',response:null,error:e.message};}
  }));
}
