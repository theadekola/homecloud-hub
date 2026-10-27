import {clusterConfig} from './cluster-config.js';
import {pve} from './connectors.js';
import {agentNodes} from './node-agents.js';
import {proxmoxTestError} from './proxmox-test-error.js';
export async function pairingTargets(kind,{config=clusterConfig,query=pve,agents=agentNodes}={}){
 if(!['proxmox','docker'].includes(kind))throw Object.assign(Error('Choose a valid connection type.'),{status:400});
 const targets=new Map();const add=(id,name,label)=>{if(typeof name==='string'&&name.trim()){const safeName=name.replace(/[^a-zA-Z0-9 _.()-]/g,'_').trim().slice(0,100);targets.set(id,{id,name:safeName,label})}};
 for(const n of agents().filter(n=>n.kind===kind))add('agent:'+n.id,n.name,n.name+' · paired host');
 const c=config();let discoveryError='';
 if(c?.url&&c.tokenId&&c.tokenSecret){try{const rows=await query('/cluster/resources',{},c);if(!Array.isArray(rows))throw Object.assign(Error(),{invalidResponse:true});for(const r of rows){if(kind==='proxmox'&&r.type==='node')add('node:'+r.node,r.node,r.node+' · Proxmox node');if(kind==='docker'&&['qemu','lxc'].includes(r.type)&&r.node&&r.vmid){const name=r.name||`${r.type==='lxc'?'CT':'VM'} ${r.vmid}`;add(`${r.node}:${r.type}/${r.vmid}`,name,`${name} · ${r.type==='lxc'?'CT':'VM'} ${r.vmid} · ${r.node}`)}}}catch(error){discoveryError=proxmoxTestError(error)}}
 return {targets:[...targets.values()].sort((a,b)=>a.label.localeCompare(b.label)),discoveryError};
}
