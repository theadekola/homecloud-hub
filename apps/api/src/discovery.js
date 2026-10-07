import crypto from 'node:crypto';
import {get,mutate} from './store.js';
export function discoveryKey(){if(!process.env.JWT_SECRET)throw new Error('Discovery key is unavailable');return crypto.createHmac('sha256',process.env.JWT_SECRET).update('homecloud-read-only-discovery-v1').digest('hex');}
export function authorizeDiscovery(value){const expected=Buffer.from(discoveryKey()),actual=Buffer.from(String(value||'').replace(/^Bearer /,''));return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
export function recordReport(body){
 const text=(v,max=200)=>typeof v==='string'?v.slice(0,max):'';
 if(!body||!/^[a-zA-Z0-9._-]{1,100}$/.test(body.id||'')||!body.hostname)throw Object.assign(new Error('Invalid discovery report'),{status:400});
 const list=(key,max)=>{if(!Array.isArray(body[key])||body[key].length>max)throw Object.assign(new Error(`Invalid ${key} inventory`),{status:400});return body[key].map(r=>({name:text(r.name),version:text(r.version),status:text(r.status),image:text(r.image),id:text(r.id)})).filter(r=>r.name);};
 const report={id:body.id,hostname:text(body.hostname),os:text(body.os),receivedAt:new Date().toISOString(),services:list('services',1000),packages:list('packages',6000),containers:list('containers',1000),errors:Array.isArray(body.errors)?body.errors.slice(0,10).map(e=>text(e)):[]};
 mutate(s=>{s.discovery={...(s.discovery||{}),[report.id]:report};if(Object.keys(s.discovery).length>500)throw Object.assign(new Error('Discovery host limit reached'),{status:400});});return report;
}
export function discovered(snapshot){
 const reports=Object.values(get().discovery||{}).map(r=>({...r,status:Date.now()-Date.parse(r.receivedAt)<120000?'online':'stale'}));
 const resources=[...(snapshot.proxmox?.vms||[]),...(snapshot.proxmox?.lxc||[])].map(r=>({id:`proxmox:${r.type}:${r.id}`,name:r.name,host:r.node,kind:r.type==='qemu'?'Virtual machine':'LXC container',status:r.status,source:'Proxmox'}));
 for(const service of snapshot.proxmox?.nodeServices||[])resources.push({id:`proxmox:service:${service.id}`,name:service.name,host:service.node,kind:'Node service',status:service.status,source:'Proxmox'});
 for(const c of snapshot.docker?.containers||[])resources.push({id:`docker:${c.id}`,name:c.name,host:snapshot.docker.host.hostname,kind:'Docker container',status:c.status,source:'Docker API',image:c.image});
 for(const host of reports){
  for(const service of host.services)resources.push({id:`${host.id}:service:${service.name}`,name:service.name,host:host.hostname,kind:'System service',status:host.status==='stale'?'stale':service.status,source:'Discovery agent',lastSeen:host.receivedAt});
  for(const c of host.containers)if(!resources.some(r=>r.source==='Docker API'&&r.id===`docker:${c.id}`))resources.push({id:`${host.id}:docker:${c.id}`,name:c.name,host:host.hostname,kind:'Docker container',status:host.status==='stale'?'stale':c.status,source:'Discovery agent',image:c.image,lastSeen:host.receivedAt});
 }
 return {resources,reports};
}
