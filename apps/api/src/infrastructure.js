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
  return value;
}
export const pveWrite=(path,method,body)=>pve(path,{method,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(Object.entries(body).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)]))});
export async function backupJobs(){return pve('/cluster/backup');}
export async function createBackupJob(body){
  const node=required(body.node,'Node'),storage=required(body.storage,'Backup storage');
  const vmid=required(String(body.vmid||''),'VM/container IDs');
  if(!/^\d+([, ]\d+)*$/.test(vmid))throw httpError('VM IDs must be a comma-separated list of numbers');
  const id=`homecloud-${crypto.randomUUID()}`;
  await pveWrite('/cluster/backup','POST',{id,node,storage,vmid,comment:required(body.name,'Name'),schedule:required(body.schedule,'Proxmox calendar schedule'),enabled:1,mode:'snapshot',compress:'zstd',...(body.retention?{'prune-backups':retention(body.retention)}:{})});
  return {id};
}
export async function runBackupJob(id){
  const job=await pve(`/cluster/backup/${encode(id)}`);
  if(!job.node)throw httpError('Choose a node-specific job to run from HomeCloud Hub; cluster-wide jobs run through the Proxmox scheduler');
  const options={};
  for(const key of ['vmid','all','exclude','pool','storage','mode','compress','bwlimit','ionice','mailto','mailnotification'])if(job[key]!=null)options[key]=job[key];
  if(!options.vmid&&!options.all&&!options.pool)throw httpError('Job has no guest selection');
  return {node:job.node,task:await pveWrite(`/nodes/${encode(job.node)}/vzdump`,'POST',options)};
}
export async function toggleBackupJob(id){const job=await pve(`/cluster/backup/${encode(id)}`);await pveWrite(`/cluster/backup/${encode(id)}`,'PUT',{enabled:job.enabled===0||job.enabled===false?1:0});}
export async function backupArchives(){
  const nodes=await pve('/nodes');const points=[],errors=[];
  await Promise.all(nodes.filter(n=>n.status==='online').map(async n=>{
    let stores;
    try{stores=await pve(`/nodes/${encode(n.node)}/storage?content=backup`)}catch(e){errors.push(`${n.node}: ${e.message}`);return;}
    await Promise.all(stores.filter(s=>s.active).map(async store=>{
      try{const files=await pve(`/nodes/${encode(n.node)}/storage/${encode(store.storage)}/content?content=backup`);
        for(const f of files)points.push({id:Buffer.from(JSON.stringify({node:n.node,storage:store.storage,volid:f.volid})).toString('base64url'),provider:'proxmox',node:n.node,storage:store.storage,volid:f.volid,name:f.volid,type:f.subtype||(/vzdump-lxc/.test(f.volid)?'lxc':'qemu'),vmid:f.vmid??null,created:f.ctime?new Date(f.ctime*1000).toISOString():null,size:f.size??null,protected:Boolean(f.protected)});
      }catch(e){errors.push(`${n.node}/${store.storage}: ${e.message}`);}
    }));
  }));
  return {points,errors};
}
export async function restoreArchive(id,body){
  const archives=await backupArchives();const point=archives.points.find(p=>p.id===id);
  if(!point)throw httpError('Backup archive not found or inaccessible',404);
  const vmid=integer(body.vmid,'New VM/container ID',100);
  const storage=required(body.storage,'Destination storage');
  const node=required(body.node||point.node,'Destination node');
  // Never overwrite an existing guest. The provider also checks for concurrent allocation.
  const resources=await pve('/cluster/resources');
  if(resources.some(r=>Number(r.vmid)===vmid))throw httpError('That VM ID already exists; choose an unused ID',409);
  if(point.type==='lxc')return {node,task:await pveWrite(`/nodes/${encode(node)}/lxc`,'POST',{vmid,ostemplate:point.volid,storage,restore:1,force:0})};
  if(point.type!=='qemu')throw httpError('Unknown backup type');
  return {node,task:await pveWrite(`/nodes/${encode(node)}/qemu`,'POST',{vmid,archive:point.volid,storage,force:0})};
}
export function truenasConfigured(){return Boolean(process.env.TRUENAS_URL&&process.env.TRUENAS_API_KEY);}
export async function truenas(method,params=[]){
  try{return await truenasCall(method,params);}catch(error){
    if(method.startsWith('pool.snapshot.')&&(error.code===-32601||/method.*not found|method.*does not exist/i.test(error.message)))return truenasCall(method.replace('pool.snapshot.','zfs.snapshot.'),params);
    throw error;
  }
}
async function truenasCall(method,params=[]){
  if(!truenasConfigured())throw httpError('TrueNAS is not configured',503);
  const base=new URL(process.env.TRUENAS_URL);
  if(base.protocol!=='https:')throw httpError('TrueNAS requires an HTTPS URL');
  const legacy=process.env.TRUENAS_API_MODE==='legacy';
  const target=new URL(process.env.TRUENAS_WS_PATH||(legacy?'/websocket':'/api/current'),base);target.protocol='wss:';
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(target,{ca:process.env.TRUENAS_TLS_CA?fs.readFileSync(process.env.TRUENAS_TLS_CA):undefined,rejectUnauthorized:true,maxPayload:32*1024*1024});
    let finished=false;
    const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);ws.close();error?reject(error):resolve(result);};
    const timer=setTimeout(()=>{finish(new Error('TrueNAS request timed out'));ws.terminate();},Number(process.env.CONNECTOR_TIMEOUT_MS)||15000);
    ws.on('error',error=>finish(error));ws.on('close',()=>{if(!finished)finish(new Error('TrueNAS closed the connection'));});
    const send=(id,method,params)=>ws.send(JSON.stringify(legacy?{msg:'method',id:String(id),method,params}:{jsonrpc:'2.0',id,method,params}));
    ws.on('open',()=>legacy?ws.send(JSON.stringify({msg:'connect',version:'1',support:['1']})):send(1,'auth.login_with_api_key',[process.env.TRUENAS_API_KEY]));
    ws.on('message',raw=>{
      let message;try{message=JSON.parse(raw.toString())}catch{return finish(new Error('Invalid TrueNAS response'));}
      if(legacy&&message.msg==='ping'){ws.send(JSON.stringify({msg:'pong',id:message.id}));return;}
      if(legacy&&message.msg==='connected'){send(1,'auth.login_with_api_key',[process.env.TRUENAS_API_KEY]);return;}
      if(legacy&&message.msg==='failed')return finish(new Error('TrueNAS legacy protocol rejected'));
      if(Number(message.id)!==1&&Number(message.id)!==2)return;
      if(message.error)return finish(Object.assign(new Error(message.error.data?.reason||message.error.reason||message.error.message||'TrueNAS API error'),{code:message.error.code}));
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
export function opnsenseConfigured(){return Boolean(process.env.OPNSENSE_URL&&process.env.OPNSENSE_API_KEY&&process.env.OPNSENSE_API_SECRET);}
export async function opnsense(path,method='GET',body){
  if(!opnsenseConfigured())throw httpError('OPNsense is not configured',503);
  if(new URL(process.env.OPNSENSE_URL).protocol!=='https:')throw httpError('OPNsense requires HTTPS');
  if(process.env.OPNSENSE_API_STYLE==='legacy')path=path.replace(/interfaces_info/g,'interfacesInfo').replace(/reload_interface/g,'reloadInterface').replace(/search_item/g,'searchItem');
  const res=await request(`${process.env.OPNSENSE_URL.replace(/\/$/,'')}/api/${path}`,{method,headers:{Authorization:`Basic ${Buffer.from(`${process.env.OPNSENSE_API_KEY}:${process.env.OPNSENSE_API_SECRET}`).toString('base64')}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined},{ca:process.env.OPNSENSE_TLS_CA?fs.readFileSync(process.env.OPNSENSE_TLS_CA):undefined,rejectUnauthorized:true});
  if(!res.ok)throw new Error(`OPNsense HTTP ${res.status}`);
  const data=await res.json();
  if(data.result==='failed'||data.status==='failed'||data.status==='error')throw new Error('OPNsense rejected the operation');
  return data;
}
export async function opnsenseSnapshot(){
  const [system,interfaces,services]=await Promise.all([opnsense('core/system/status'),opnsense('interfaces/overview/interfaces_info'),opnsense('core/service/search')]);
  return {system,interfaces:Array.isArray(interfaces)?interfaces:Object.entries(interfaces).map(([id,data])=>({id,...data})),services:services.rows||[]};
}
export function tailscaleConfigured(){return Boolean(process.env.TAILSCALE_API_KEY&&process.env.TAILSCALE_TAILNET);}
export async function tailscale(path,method='GET',body){
  if(!tailscaleConfigured())throw httpError('Tailscale is not configured',503);
  const apiBase=(process.env.TAILSCALE_API_BASE||'https://api.tailscale.com/api/v2').replace(/\/$/,'');
  if(new URL(apiBase).protocol!=='https:')throw httpError('Tailscale API requires HTTPS');
  const res=await request(`${apiBase}/${path}`,{method,headers:{Authorization:`Bearer ${process.env.TAILSCALE_API_KEY}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined},{ca:process.env.TAILSCALE_TLS_CA?fs.readFileSync(process.env.TAILSCALE_TLS_CA):undefined});
  if(!res.ok)throw new Error(`Tailscale HTTP ${res.status}`);
  const text=await res.text();return text?JSON.parse(text):{};
}
export async function tailscaleSnapshot(){
  const result=await tailscale(`tailnet/${encode(process.env.TAILSCALE_TAILNET)}/devices?fields=all`);
  return {devices:(result.devices||[]).map(d=>({id:d.id,name:d.hostname||d.name,user:d.user,addresses:d.addresses?.join(', ')||'',os:d.os,lastSeen:d.lastSeen,authorized:d.authorized,expires:d.expires,routes:d.enabledRoutes||[],advertisedRoutes:d.advertisedRoutes||[]}))};
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
