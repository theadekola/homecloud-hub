import {pve} from './connectors.js';
import {required,httpError,pveWrite,encode} from './infrastructure.js';

export async function storageInventory(){
 const errors=[],resources=[];
 const nodes=await pve('/nodes');let configs=[];
 try{configs=await pve('/storage');}catch(e){errors.push(`Storage configuration: ${e.message}`);}
 for(let i=0;i<nodes.length;i+=5)await Promise.all(nodes.slice(i,i+5).map(async node=>{
  try{const entries=await pve(`/nodes/${encode(node.node)}/storage`);
   for(const row of entries){const config=configs.find(c=>c.storage===row.storage)||{};
    resources.push({id:`${node.node}/${row.storage}`,name:row.storage,node:node.node,type:row.type||config.type||'Unknown',shared:row.shared==null?(config.shared==null?null:Boolean(config.shared)):Boolean(row.shared),status:row.enabled===0?'disabled':row.active===1?'online':row.active===0?'offline':'unknown',capacity:row.total??null,used:row.used??null,available:row.avail??null,usage:row.total>0&&typeof row.used==='number'?row.used/row.total*100:null,content:row.content||config.content||null});
   }
  }catch(e){errors.push(`${node.node} storage: ${e.message}`);}
 }));
 return {resources,errors,sampledAt:new Date().toISOString()};
}
export async function storageDetails(node,id,timeframe='day'){
 const base=`/nodes/${encode(node)}/storage/${encode(id)}`,result={errors:[]};
 const period=['hour','day','week','month','year'].includes(timeframe)?timeframe:'day';
 await Promise.all([['status',`${base}/status`],['content',`${base}/content`],['history',`${base}/rrddata?timeframe=${period}&cf=AVERAGE`]].map(async([key,path])=>{try{result[key]=await pve(path);}catch(e){result.errors.push(`${key}: ${e.message}`);}}));
 return result;
}
export function storageSummary(pools){
 const groups=new Map();
 for(const p of pools){const key=p.provider==='proxmox'&&p.shared===true?`proxmox:shared:${p.name}`:`${p.provider}:${p.id}`;const old=groups.get(key);if(!old||(!['online','ONLINE'].includes(old.status)&&['online','ONLINE'].includes(p.status))||(!(old.capacity>0)&&p.capacity>0))groups.set(key,p);}
 const unique=[...groups.values()],online=unique.filter(p=>['online','ONLINE'].includes(p.status)),measured=online.filter(p=>p.capacity>0&&Number.isFinite(p.used)&&Number.isFinite(p.available));
 const uncertain=unique.some(p=>p.provider==='proxmox'&&p.shared==null);
 const complete=!uncertain&&online.length>0&&measured.length===online.length;
 return {pools:unique.length,online:online.length,measured:measured.length,complete,capacity:complete?measured.reduce((n,p)=>n+p.capacity,0):null,used:complete?measured.reduce((n,p)=>n+p.used,0):null,available:complete?measured.reduce((n,p)=>n+p.available,0):null,distribution:measured.map(p=>({...p,key:`${p.provider}:${p.id}`}))};
}
export function createStorage(input){
 const type=required(input.type,'Type'),storage=required(input.storage,'Storage ID');
 if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(storage))throw httpError('Storage ID must start with a letter and contain letters, numbers, underscores or hyphens');
 const fields={dir:['path'],lvm:['vgname'],lvmthin:['vgname','thinpool'],nfs:['server','export'],iscsi:['portal','target'],rbd:['pool'],cephfs:[]}[type];
 if(!Array.isArray(fields))throw httpError('Unsupported storage type');
 const body={type,storage,content:input.content||(['lvm','lvmthin','rbd'].includes(type)?'images,rootdir':type==='iscsi'?'images':'images,rootdir,iso,vztmpl,backup')};
 for(const key of fields)body[key]=required(input[key],key);
 if(type==='dir'&&!String(body.path).startsWith('/'))throw httpError('Directory path must be absolute');
 if(input.nodes)body.nodes=String(input.nodes);
 return pveWrite('/storage','POST',body);
}
