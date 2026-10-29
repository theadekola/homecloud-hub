import {operationsView} from './operations-health.js';
const name=value=>String(value||'').toLowerCase().replace(/\.$/,'');
export async function vpnGateways({query,agents,now=Date.now()}={}){
 const rows=await query('/nodes');
 if(!Array.isArray(rows)||rows.some(row=>!row||typeof row.node!=='string'||!row.node))throw Object.assign(Error('Proxmox node discovery is unavailable. Check the cluster connection and permissions.'),{status:503});
 const connectors=agents();
 return {sampledAt:new Date(now).toISOString(),nodes:rows.map(row=>{
  // A friendly label or a guest's parent node is not the connector's host identity.
  const matches=connectors.filter(agent=>agent.kind==='proxmox'&&name(agent.hostname)===name(row.node));
  if(matches.length!==1)return {id:'proxmox:'+row.node,name:row.node,hostname:row.node,agentId:null,version:0,online:row.status==='online',status:matches.length?'connector-conflict':'pairing-required',report:null};
  const agent=matches[0],reading=operationsView([agent],now).nodes[0];
  return {...reading,name:row.node,hostname:row.node,agentId:agent.id,status:row.status==='online'?reading.status:'offline'};
 }).sort((a,b)=>Number(b.online)-Number(a.online)||a.name.localeCompare(b.name))};
}
export async function requireVPNNode(id,options){
 const view=await vpnGateways(options),node=view.nodes.find(row=>row.agentId===id);
 if(!node)throw Object.assign(Error('Select a paired Proxmox node for the VPN gateway. VM, CT and standalone Docker connectors cannot host this node VPN.'),{status:409});
 if(node.status!=='current')throw Object.assign(Error('Refresh a current Proxmox node connector before changing its VPN.'),{status:409});
 return node;
}
