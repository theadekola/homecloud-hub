import {clusterConfig} from './cluster-config.js';
import {agentHosts,agentNodes} from './node-agents.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const nodeTarget=node=>typeof node==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(node)?`node:${node}`:null;
const decodedNode=value=>{try{return nodeTarget(decodeURIComponent(value))}catch{return null}};
export function approvalTargetForPath(path,body={},method='POST'){
 if(typeof path!=='string'||path.length>4096||!body||typeof body!=='object'||Array.isArray(body))return null;
 const lifecycle=path.match(/^\/actions\/proxmox\/(?:vm|lxc)\/\d+\/(?:start|stop|shutdown|reboot|reset|suspend|resume|snapshot|delete-snapshot|clone|delete)$/);
 if(lifecycle&&method==='POST')return nodeTarget(body.node);
 const node=path.match(/^\/proxmox\/node\/([^/]+)\/(?:power\/(?:reboot|shutdown)|service\/[^/]+\/(?:start|stop|restart))$/);
 if(node&&method==='POST')return decodedNode(node[1]);
 const network=path.match(/^\/(?:proxmox\/network|network\/dns|network\/firewall)\/([^/]+)(?:\/[^/]+(?:\/\d+)?)?$/);
 if(network&&['POST','PUT','DELETE'].includes(method))return decodedNode(network[1]);
 const task=path.match(/^\/tasks\/([^/]+)\/[^/]+$/);if(task&&method==='DELETE')return decodedNode(task[1]);
 if(method==='POST'&&(/^\/storage\/snapshots\/guest\/(?:rollback|delete)$/.test(path)||/^\/restore\/[^/]+\/run$/.test(path)||/^\/proxmox\/(?:vm|ct)$/.test(path)))return nodeTarget(body.node);
 if(method==='POST'&&path==='/retention/run')return nodeTarget(body.node);
 return null;
}
export async function resolveActionApproval(path,body={},method='POST',{dockerHost='',query,hosts=agentHosts,nodes=agentNodes}={}){
 if(typeof path!=='string'||!body||typeof body!=='object'||Array.isArray(body)||!['POST','PUT','DELETE'].includes(method))return null;
 const direct=approvalTargetForPath(path,body,method);if(direct)return {target:direct,scope:direct};
 const nodeBound=/^\/(?:proxmox\/(?:node|network)\/|network\/(?:dns|firewall)\/|tasks\/|actions\/proxmox\/|storage\/snapshots\/guest\/(?:rollback|delete)$|restore\/[^/]+\/run$)/.test(path)||(method==='POST'&&['/proxmox/vm','/proxmox/ct','/retention/run'].includes(path));
 if(nodeBound)fail('Invalid node target or action for password approval');
 const clusterAction=(method==='POST'&&/^\/proxmox\/storage$/.test(path))||(method==='PUT'&&/^\/proxmox\/storage\/[^/]+\/enabled$/.test(path))||(method==='DELETE'&&/^\/schedules\/[^/]+$/.test(path))||(method==='POST'&&['/retention'].includes(path))||(method==='POST'&&/^\/proxmox\/creation\/[^/]+\/ha$/.test(path));
 if(clusterAction){
  if(!query)query=(await import('./connectors.js')).pve;
  const status=await query('/cluster/status');if(!Array.isArray(status))fail('Cluster node inventory is unavailable',502);
  const candidates=status.filter(n=>n.type==='node'&&nodeTarget(n.name)&&n.ip&&n.online!==0&&n.online!=='0'&&n.online!==false);
  let configured='';try{configured=new URL(clusterConfig().url||process.env.PROXMOX_URL||'').hostname;}catch{}
  const node=candidates.find(n=>n.ip===configured||n.name===configured)||candidates[0];if(!node)fail('No reachable cluster node is available for password approval',503);
  return {target:nodeTarget(node.name),scope:`${nodeTarget(node.name)}|cluster`,description:'Cluster-wide change: verify a Proxmox cluster node password.'};
 }
 const setup=path==='/node-agents/guest/setup'&&method==='POST';
 const docker=/^\/(?:docker(?:\/|$)|actions\/docker\/)/.test(path);
 if(!setup&&!(docker&&dockerHost))return null;
 const identity=setup?body.host:dockerHost,host=hosts().find(h=>h.id===identity),agent=nodes().find(n=>n.id===host?.agent);
 if(!host||!agent)fail('Selected Docker host is unavailable',404);
 if(agent.kind!=='proxmox'){if(setup)fail('Guest installation requires a paired Proxmox node');return null;}
 if(setup&&!host.setup)fail('This guest is no longer eligible for installation. Refresh discovery.',409);
 if(!agent.online)fail('Paired Proxmox node is offline',503);
 if(!query)query=(await import('./connectors.js')).pve;
 const resources=await query('/cluster/resources');if(!Array.isArray(resources))fail('Cluster inventory is unavailable',502);
 const names=[...new Set(resources.map(r=>r.node).filter(Boolean))],original=String(agent.hostname||agent.name||'');
 let node=names.find(n=>n===original);if(!node){const short=original.split('.')[0],matches=names.filter(n=>n.split('.')[0]===short);if(matches.length===1)node=matches[0];}
 if(!node)fail('Paired connector hostname does not identify a cluster node',403);
 const suffix=host.id.slice(agent.id.length+1);let target;
 if(suffix==='node'){if(setup)fail('Guest installation requires a VM or container');target=nodeTarget(node);}
 else{const guest=suffix.match(/^(qemu|lxc)\/(\d+)$/);if(!guest||!resources.some(r=>r.node===node&&r.type===guest[1]&&String(r.vmid)===guest[2]))fail('Selected guest is no longer on this paired node. Refresh discovery.',409);target=`${guest[1]==='qemu'?'vm':'lxc'}:${node}:${guest[2]}`;}
 return {target,scope:setup?target:`${target}|docker:${identity}`,dockerHost:docker?identity:''};
}
