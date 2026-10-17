import {storagePlacement,storageNodes} from './storage-scope.js';
import {pve} from './connectors.js';
import {required,httpError,pveWrite,encode} from './infrastructure.js';

export async function storageInventory(query=pve){
 const errors=[],resources=[],readNodes=[];
 const nodes=await query('/nodes');if(!Array.isArray(nodes)||nodes.some(n=>!n||typeof n.node!=='string'||!n.node.trim()))throw Object.assign(new Error('Invalid Proxmox node inventory'),{status:502});let configs=[];if(!nodes.length)errors.push('No Proxmox nodes are visible; storage inventory could not be verified.');
 try{configs=await query('/storage');if(!Array.isArray(configs)||configs.some(config=>!config||typeof config.storage!=='string'||!config.storage))throw new Error('Invalid storage configuration response');}catch(e){configs=[];errors.push(`Storage configuration: ${e.message}`);}
 for(let i=0;i<nodes.length;i+=5)await Promise.all(nodes.slice(i,i+5).map(async node=>{
  try{const entries=await query(`/nodes/${encode(node.node)}/storage`);
   if(!Array.isArray(entries)||entries.some(row=>!row||typeof row.storage!=='string'||!row.storage))throw new Error('Invalid node storage response');
   const reported=new Set(entries.map(row=>row.storage));
   const rows=[...entries,...configs.filter(config=>!reported.has(config.storage)&&(!config.nodes||storagePlacement(config,node.node).applicable)).map(config=>({storage:config.storage,reported:false}))];
   for(const row of rows){const config=configs.find(c=>c.storage===row.storage)||{};
    const flag=value=>[true,1,'1'].includes(value)?true:[false,0,'0'].includes(value)?false:null;
    const capacity=Number.isFinite(row.total)&&row.total>0?row.total:null;
    const reading=value=>capacity!==null&&Number.isFinite(value)&&value>=0&&value<=capacity?value:null;
    const used=reading(row.used),available=reading(row.avail),enabled=flag(row.enabled),active=flag(row.active),placement=storagePlacement(config,node.node);
    const status=!placement.applicable?'not-assigned':enabled===false||flag(config.disable)===true?'disabled':active===true?'online':active===false?'offline':'unknown';
    const availabilityReason=placement.availabilityReason||(status==='disabled'?'Disabled in Proxmox. Enabling this storage affects all assigned nodes.':status==='offline'?[1,true,'1'].includes(config.is_mountpoint)?`Proxmox reports this storage inactive. Check its required mount point ${config.path||''} on ${node.node}.`:`Proxmox reports this storage inactive on ${node.node}. Check the backing device or remote mount.`:status==='unknown'?'Registered in Proxmox; availability was not reported by this node.':`Available on ${node.node}.`);
    resources.push({id:`${node.node}/${row.storage}`,name:row.storage,node:node.node,type:row.type||config.type||'Unknown',shared:flag(row.shared??config.shared),...placement,scopeVerified:!!config.storage,scope:config.storage?placement.scope:'unknown',status,availabilityReason,reported:row.reported!==false,capacity,used,available,usage:capacity!==null&&used!==null?used/capacity*100:null,content:row.content||config.content||null,...Object.fromEntries(['path','server','export','portal','nodes'].filter(key=>typeof config[key]==='string').map(key=>[key,config[key]]))});
   }
   readNodes.push(node.node);
  }catch(e){errors.push(`${node.node} storage: ${e.message}`);
   // Keep assigned registrations visible even if the node cannot be queried.
   for(const config of configs){const placement=storagePlacement(config,node.node);if(!placement.applicable)continue;
    resources.push({id:`${node.node}/${config.storage}`,name:config.storage,node:node.node,type:config.type||'Unknown',shared:[1,true,'1'].includes(config.shared)?true:[0,false,'0'].includes(config.shared)?false:null,...placement,scopeVerified:true,status:[1,true,'1'].includes(config.disable)?'disabled':'unknown',reported:false,capacity:null,used:null,available:null,usage:null,content:config.content||null,availabilityReason:`Storage is registered for ${node.node}, but its measurements could not be read: ${e.message}`,...Object.fromEntries(['path','server','export','portal','nodes'].filter(key=>typeof config[key]==='string').map(key=>[key,config[key]]))});
   }
  }
 }));
 const missingNodes=nodes.map(n=>n.node).filter(n=>!readNodes.includes(n)),coverage={complete:!errors.length&&nodes.length>0&&missingNodes.length===0,expectedNodes:nodes.map(n=>n.node),readNodes,missingNodes};
 return {resources,errors,coverage,nodes:nodes.map(n=>n.node),reportedNodes:[...new Set(resources.map(r=>r.node))],sampledAt:new Date().toISOString()};
}
export async function storageDetails(node,id,timeframe='day',includeHistory=true){
 const base=`/nodes/${encode(node)}/storage/${encode(id)}`,result={errors:[]};
 const period=['hour','day','week','month','year'].includes(timeframe)?timeframe:'day';
 await Promise.all([['status',`${base}/status`],['content',`${base}/content`],...(includeHistory?[['history',`${base}/rrddata?timeframe=${period}&cf=AVERAGE`]]:[])].map(async([key,path])=>{try{result[key]=await pve(path);}catch(e){result.errors.push(`${key}: ${e.message}`);}}));
 return result;
}
export function storageSummary(pools,coverage={complete:true}){
 const groups=new Map(),rank=p=>(['online','ONLINE'].includes(p.status)?2:0)+(p.capacity>0&&Number.isFinite(p.used)&&Number.isFinite(p.available)?1:0);
 for(const p of pools.filter(p=>p.applicable!==false)){const key=p.provider==='proxmox'&&p.shared===true?`proxmox:shared:${p.name}`:`${p.provider}:${p.id}`;const old=groups.get(key);if(!old||rank(p)>rank(old))groups.set(key,p);}
 const unique=[...groups.values()],online=unique.filter(p=>['online','ONLINE'].includes(p.status)),measured=online.filter(p=>p.capacity>0&&Number.isFinite(p.used)&&Number.isFinite(p.available));
 const uncertain=unique.some(p=>p.provider==='proxmox'&&p.shared==null);
 const complete=coverage.complete!==false&&!uncertain&&online.length>0&&measured.length===online.length;
 return {notAssigned:pools.filter(p=>p.applicable===false).length,pools:unique.length,online:online.length,measured:measured.length,complete,coverage,measuredCapacity:measured.reduce((n,p)=>n+p.capacity,0),capacity:complete?measured.reduce((n,p)=>n+p.capacity,0):null,used:complete?measured.reduce((n,p)=>n+p.used,0):null,available:complete?measured.reduce((n,p)=>n+p.available,0):null,distribution:measured.map(p=>({...p,key:`${p.provider}:${p.id}`}))};
}
export function createStorage(input,write=pveWrite){
 const type=required(input.type,'Type'),storage=required(input.storage,'Storage ID');
 if(!/^[A-Za-z][A-Za-z0-9_-]*$/.test(storage))throw httpError('Storage ID must start with a letter and contain letters, numbers, underscores or hyphens');
 const fields={dir:['path'],lvm:['vgname'],lvmthin:['vgname','thinpool'],nfs:['server','export'],iscsi:['portal','target'],rbd:['pool'],cephfs:[]}[type];
 if(!Array.isArray(fields))throw httpError('Unsupported storage type');
 const body={type,storage,content:input.content||(type==='cephfs'?'iso,vztmpl,backup,snippets':['lvm','lvmthin','rbd'].includes(type)?'images,rootdir':type==='iscsi'?'images':'images,rootdir,iso,vztmpl,backup')};
 if(type==='cephfs'&&String(body.content).split(',').some(c=>!['iso','vztmpl','backup','snippets'].includes(c.trim())))throw httpError('CephFS supports ISO, templates, backups and snippets, not VM disks or container roots');
 for(const key of fields)body[key]=required(input[key],key);
 if(type==='dir'&&!String(body.path).startsWith('/'))throw httpError('Directory path must be absolute');
 if(input.nodes)body.nodes=String(input.nodes);
 return write('/storage','POST',body);
}


// Cluster configuration is independent of a node's current mount/active state.
// Explicitly whitelist fields: some storage plugins include credentials.
export async function storageConfiguration(query=pve){
 const configs=await query('/storage');
 if(!Array.isArray(configs)||configs.some(row=>!row||typeof row.storage!=='string'||!row.storage))throw httpError('Invalid storage configuration response',502);
 const flag=value=>[1,true,'1'].includes(value)?true:[0,false,'0'].includes(value)?false:null;
 return {resources:configs.map(config=>({id:config.storage,type:typeof config.type==='string'?config.type:'Unknown',content:typeof config.content==='string'?config.content.split(',').map(value=>value.trim()).filter(Boolean):[],nodes:storageNodes(config),shared:flag(config.shared),enabled:config.disable==null?true:flag(config.disable)===null?null:!flag(config.disable),...Object.fromEntries(['path','server','export','portal','vgname','thinpool','pool'].filter(key=>typeof config[key]==='string').map(key=>[key,config[key]]))})),sampledAt:new Date().toISOString()};
}
