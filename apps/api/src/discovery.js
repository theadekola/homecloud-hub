import {monitoredDocker} from './docker-fleet.js';
export function discovered(snapshot){
 const reports=snapshot.proxmox?.guestInventory?.reports||[];
 const resources=[...(snapshot.proxmox?.vms||[]),...(snapshot.proxmox?.lxc||[])].map(r=>({id:`proxmox:${r.type}:${r.id}`,name:r.name,host:r.node,kind:r.type==='qemu'?'Virtual machine':'LXC container',status:r.status,source:'Proxmox'}));
 for(const service of snapshot.proxmox?.nodeServices||[])resources.push({id:`proxmox:service:${service.id}`,name:service.name,host:service.node,kind:'Node service',status:service.status,source:'Proxmox'});
 for(const c of monitoredDocker(snapshot))resources.push({id:`docker:${c.monitorId}`,containerId:c.id,hostId:c.hostId,node:c.node,name:c.name,host:c.host,kind:'Docker container',status:c.status,source:'Docker API',image:c.image});
 for(const host of reports){
  for(const service of host.services)resources.push({id:`${host.id}:service:${service.name}`,name:service.name,host:host.hostname,node:host.node,kind:'System service',status:host.status==='stale'?'stale':service.status,source:'Proxmox guest API',lastSeen:host.receivedAt});
  for(const c of host.containers)if(!resources.some(r=>r.source==='Docker API'&&r.containerId===c.id&&r.host===host.hostname))resources.push({id:`${host.id}:docker:${c.id}`,name:c.name,host:host.hostname,node:host.node,kind:'Docker container',status:host.status==='stale'?'stale':c.status,source:'Proxmox guest API',image:c.image,lastSeen:host.receivedAt});
 }
 return {resources,reports,discoveryLimitations:[...(snapshot.proxmox?.guestInventory?.limitations||[]),...(snapshot.proxmox?.lxc?.length?['LXC application inventory requires guest access; Proxmox exposes its lifecycle and resource measurements.']:[])]};
}
