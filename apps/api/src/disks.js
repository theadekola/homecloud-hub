import {pve} from './connectors.js';
import {encode,httpError} from './infrastructure.js';

export function normalizeDisk(d,node){
 const device=d.devpath||d.name;
 return {id:`proxmox:${node}:${device}`,provider:'proxmox',node,name:device,model:d.model||null,serial:d.serial||null,type:d.type||'Unknown',size:Number.isFinite(Number(d.size))&&d.size!=null?Number(d.size):null,health:/^(unknown|n\/a)$/i.test(d.health||d.status||'')?null:d.health||d.status||null,assignment:d.used||null,wearout:d.wearout??null,gpt:d.gpt??null};
}
export async function diskInventory(query=pve){
 const resources=[],errors=[],nodes=await query('/nodes');
 for(let i=0;i<nodes.length;i+=5)await Promise.all(nodes.slice(i,i+5).map(async n=>{
  if(n.status&&n.status!=='online'){errors.push(`${n.node}: node is offline`);return;}
  try{const disks=await query(`/nodes/${encode(n.node)}/disks/list`);resources.push(...disks.map(d=>normalizeDisk(d,n.node)));}catch(e){errors.push(`${n.node} disks: ${e.message}`);}
 }));
 return {resources,errors};
}
export async function diskSmart(node,disk,query=pve){
 if(typeof disk!=='string'||!disk.startsWith('/dev/'))throw httpError('Select a detected disk');
 const disks=await query(`/nodes/${encode(node)}/disks/list`);
 if(!disks.some(d=>d.devpath===disk))throw httpError('Disk is not in the node inventory',404);
 return {report:await query(`/nodes/${encode(node)}/disks/smart?disk=${encode(disk)}`),sampledAt:new Date().toISOString()};
}
