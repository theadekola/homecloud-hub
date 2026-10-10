import {agentContext,agentHosts,agentNodes} from './node-agents.js';
import {dockerSnapshot} from './connectors.js';

export function createDockerFleet({hosts=agentHosts,read=dockerSnapshot,nodes=()=>null,now=()=>Date.now()}={}){
 const cache=new Map();
 return async()=>{
  const reported=[...hosts()],known=new Set(reported.map(h=>h.id)),registered=nodes();
  for(const n of registered||[])if(n.online===false&&!reported.some(h=>h.id.startsWith(n.id+':')))reported.push({id:n.id+':node-agent',node:n.name,name:'Node agent',online:false,status:'connected'});
  for(const [id,previous] of cache)if(!known.has(id)){
   if(registered?.some(n=>n.id===id.split(':')[0]))reported.push({id,node:previous.node,name:previous.name,online:false});
   else cache.delete(id);
  }
  const selected=reported.filter(h=>h.online||h.status==='connected'||cache.has(h.id)),results=[];
  for(let i=0;i<selected.length;i+=2)await Promise.all(selected.slice(i,i+2).map(async h=>{
   const row={id:h.id,node:h.node,name:h.name,status:'error',sampledAt:new Date(now()).toISOString()};
   if(!h.online){results.push({...row,error:'Docker host or its node agent is offline',lastSeen:cache.get(h.id)?.sampledAt||null});return;}
   const started=now();
   try{const data=await agentContext.run({host:h.id},()=>read({timeoutMs:30000}));
    const measured={...row,status:data.errors?.length?'partial':'reachable',error:data.errors?.length?data.errors.join('; '):undefined,response:now()-started,inventory:data};cache.set(h.id,measured);results.push(measured);
   }catch{results.push({...row,error:'Docker inventory unavailable; inspect the selected host and node agent',lastSeen:cache.get(h.id)?.sampledAt||null});}
  }));
  return {hosts:results.sort((a,b)=>a.id.localeCompare(b.id))};
 };
}
export const dockerFleet=createDockerFleet({nodes:agentNodes});
export function monitoredDocker(snapshot){
 const direct=snapshot.docker,engines=new Set(direct?.host?.engineId?[direct.host.engineId]:[]);
 const rows=direct?(direct.containers||[]).map(c=>({...c,monitorId:`direct:${c.id}`,connectorId:'docker',hostId:'direct',host:direct.host.hostname})):[];
 for(const host of snapshot.dockerFleet?.hosts||[]){
  const data=host.inventory;if(!['reachable','partial'].includes(host.status)||!data)continue;
  if(data.host.engineId&&engines.has(data.host.engineId))continue;
  if(data.host.engineId)engines.add(data.host.engineId);
  rows.push(...data.containers.map(c=>({...c,monitorId:`${host.id}:${c.id}`,connectorId:`docker:${host.id}`,hostId:host.id,node:host.node,host:data.host.hostname})));
 }
 return rows;
}
