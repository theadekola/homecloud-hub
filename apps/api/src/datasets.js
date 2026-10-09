import {pve} from './connectors.js';
import {truenas,encode,required,httpError} from './infrastructure.js';
import {storageInventory,storageSummary} from './storage.js';

const number=v=>{if(v==null)return null;const n=Number(v?.parsed??v?.rawvalue??v?.value??v);return Number.isFinite(n)?n:null;};
const value=v=>v?.value??v??null;
export function normalizeDataset(d){
 const used=number(d.used),available=number(d.available),quota=number(d.quota),volsize=number(d.volsize);
 return {id:`truenas:${d.id||d.name}`,resourceId:d.id||d.name,name:d.name,provider:'truenas',pool:d.name.split('/')[0],type:d.type==='VOLUME'?'ZFS Volume':'Dataset',used,available,size:d.type==='VOLUME'?volsize:quota>0?quota:null,mountpoint:value(d.mountpoint),compression:value(d.compression),deduplication:value(d.deduplication),readonly:value(d.readonly),created:value(d.creation),status:d.locked===true?'Locked':d.mounted?.value==='no'?'Unmounted':d.mounted?.value==='yes'?'Mounted':'Reported',usedByDataset:number(d.usedbydataset),quota:quota>0?quota:null};
}
export async function datasetInventory({proxmox=false,truenasEnabled=false,snapshot={},query=pve,tn=truenas,inventory=storageInventory}={}){
 const resources=[],errors=[],pools=[];
 if(proxmox)try{
  const result=await inventory();errors.push(...result.errors);pools.push(...result.resources.map(p=>({...p,provider:'proxmox'})));
  const seen=new Set();const online=result.resources.filter(p=>p.status==='online');
  for(let i=0;i<online.length;i+=5)await Promise.all(online.slice(i,i+5).map(async p=>{
   try{const rows=await query(`/nodes/${encode(p.node)}/storage/${encode(p.name)}/content`);
    for(const row of rows.filter(r=>['images','rootdir'].includes(r.content))){const key=p.shared===true?`shared:${row.volid}`:`${p.node}:${row.volid}`;if(seen.has(key))continue;seen.add(key);
     resources.push({id:`proxmox:${key}`,resourceId:row.volid,name:row.volid,provider:'proxmox',pool:p.name,node:p.node,type:row.content==='images'?'VM Volume':'CT Volume',size:number(row.size),used:number(row.used),available:null,mountpoint:null,status:'Reported',vmid:row.vmid??null,format:row.format||null,shared:p.shared});
    }
   }catch(e){errors.push(`${p.node}/${p.name} volumes: ${e.message}`);}
  }));
 }catch(e){errors.push(`Proxmox: ${e.message}`);}
 if(truenasEnabled)try{resources.push(...(await tn('pool.dataset.query',[[],{extra:{flat:true}}])).map(normalizeDataset));pools.push(...(snapshot.pools||[]));}catch(e){errors.push(`TrueNAS: ${e.message}`);}
 return {resources,summary:storageSummary(pools),pools,errors,snapshots:snapshot.snapshots||[],truenasEnabled,sampledAt:new Date().toISOString()};
}
export function datasetCreateInput(input){
 const name=required(input.name,'Dataset path');if(!/^[^/@\s]+(?:\/[^/@\s]+)+$/.test(name)||name.split('/').some(s=>['.','..'].includes(s)))throw httpError('Enter a pool/dataset path');
 const type=input.type||'FILESYSTEM';if(!['FILESYSTEM','VOLUME'].includes(type))throw httpError('Unsupported dataset type');
 const body={name,type};if(input.compression){if(!['LZ4','ZSTD','OFF','INHERIT'].includes(input.compression))throw httpError('Unsupported compression');body.compression=input.compression;}
 if(type==='VOLUME'){const size=Number(input.volsize);if(!Number.isSafeInteger(size)||size<1024**2||size%16384!==0)throw httpError('Volume size must be a positive multiple of 16 KiB');body.volsize=size;body.volblocksize='16K';}
 else if(input.quota!=null&&input.quota!==''){const quota=Number(input.quota);if(!Number.isSafeInteger(quota)||quota<0)throw httpError('Quota must be a non-negative byte count');body.quota=quota;}
 return body;
}
export function datasetPermissionsInput(input,path){
 if(typeof input.mode!=='string'||!/^0?[0-7]{3}$/.test(input.mode))throw httpError('Mode must contain three octal permission digits');
 const body={path,mode:input.mode,options:{recursive:false,traverse:false,stripacl:false}};
 for(const key of ['uid','gid'])if(input[key]!=null&&input[key]!==''){const id=Number(input[key]);if(!Number.isInteger(id)||id<0||id>2147483647)throw httpError(`${key} must be a non-negative numeric ID`);body[key]=id;}
 return body;
}
export async function datasetRoot(id,tn=truenas){
 const rows=await tn('pool.dataset.query',[[['id','=',required(id,'Dataset')]]]);const d=rows.find(r=>r.id===id);
 const mountpoint=value(d?.mountpoint);if(!d||d.type!=='FILESYSTEM'||d.locked||typeof mountpoint!=='string'||!mountpoint.startsWith('/mnt/')||mountpoint.includes('/../'))throw httpError('Dataset has no accessible filesystem mountpoint');
 return mountpoint;
}
