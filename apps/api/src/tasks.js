import {pve} from './connectors.js';
import {encode,integer,httpError} from './infrastructure.js';
export async function taskInventory(hours=24){
 hours=integer(hours,'Hours',1,168);const nodes=await pve('/nodes'),tasks=[],errors=[],truncated=[];
 await Promise.all(nodes.map(async n=>{try{const rows=await pve(`/nodes/${encode(n.node)}/tasks?source=all&limit=500&since=${Math.floor(Date.now()/1000)-hours*3600}`);tasks.push(...rows.map(t=>({...t,node:n.node})));if(rows.length===500)truncated.push(n.node);}catch(e){errors.push(`${n.node}: ${e.message}`);}}));
 return {nodes,tasks:tasks.sort((a,b)=>b.starttime-a.starttime),errors,truncated,sampledAt:new Date().toISOString()};
}
export async function stopTask(node,id){const status=await pve(`/nodes/${encode(node)}/tasks/${encode(id)}/status`);if(status.status!=='running')throw httpError('Only running tasks can be stopped',409);await pve(`/nodes/${encode(node)}/tasks/${encode(id)}`,{method:'DELETE'});return {node,upid:id,requested:true};}
