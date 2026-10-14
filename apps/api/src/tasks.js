import {pve} from './connectors.js';
import {encode,integer,httpError} from './infrastructure.js';
export async function taskInventory(hours=24,query=pve){
 hours=integer(hours,'Hours',1,720);const nodes=await query('/nodes'),tasks=[],errors=[],truncated=[];if(!Array.isArray(nodes))throw Object.assign(new Error('Invalid Proxmox node inventory'),{status:502});
 for(let i=0;i<nodes.length;i+=5)await Promise.all(nodes.slice(i,i+5).map(async n=>{try{const rows=await query(`/nodes/${encode(n.node)}/tasks?source=all&limit=500&since=${Math.floor(Date.now()/1000)-hours*3600}`);if(!Array.isArray(rows))throw new Error('Unexpected task inventory response');tasks.push(...rows.map(t=>({...t,node:n.node})));if(rows.length===500)truncated.push(n.node);}catch(e){errors.push(`${n.node}: ${e.message}`);}}));
 return {nodes,tasks:tasks.sort((a,b)=>b.starttime-a.starttime),errors,truncated,sampledAt:new Date().toISOString()};
}
export async function stopTask(node,id){const status=await pve(`/nodes/${encode(node)}/tasks/${encode(id)}/status`);if(String(status.status).toLowerCase()!=='running')throw httpError('Only running tasks can be stopped',409);await pve(`/nodes/${encode(node)}/tasks/${encode(id)}`,{method:'DELETE'});return {node,upid:id,requested:true};}
