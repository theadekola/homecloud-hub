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
