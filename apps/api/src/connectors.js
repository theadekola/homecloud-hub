import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';

// Per-connection TLS settings; never disable certificate checks globally.
export function request(url, init={}, tls={}) {
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    const transport=target.protocol==='https:'?https:http;
    const req=transport.request(target,{method:init.method||'GET',headers:init.headers,...tls},res=>{
      const chunks=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>32*1024*1024){req.destroy(new Error('Connector response exceeds 32 MiB'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>{
        const buffer=Buffer.concat(chunks);
        resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,
          text:async()=>buffer.toString('utf8'),json:async()=>JSON.parse(buffer.toString('utf8')),buffer});
      });
    });
    const timeout=setTimeout(()=>req.destroy(new Error('Connector request timed out')),init.timeoutMs||Number(process.env.CONNECTOR_TIMEOUT_MS)||15000);
    req.on('close',()=>clearTimeout(timeout));
    req.on('error',reject);
    if(init.body)req.write(String(init.body));
    req.end();
  });
}

const pveUrl=process.env.PROXMOX_URL?.replace(/\/$/,'');
const pveTokenId=process.env.PROXMOX_TOKEN_ID;
const pveSecret=process.env.PROXMOX_TOKEN_SECRET;

export async function pve(path, init={}){
  if(!pveUrl||!pveTokenId||!pveSecret) throw Object.assign(new Error('Proxmox is not configured'),{status:503});
  const headers={Authorization:`PVEAPIToken=${pveTokenId}=${pveSecret}`,...(init.headers||{})};
  const res=await request(`${pveUrl}/api2/json${path}`,{...init,headers},{rejectUnauthorized:process.env.PROXMOX_VERIFY_TLS!=='false'});
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw Object.assign(new Error(body?.errors?JSON.stringify(body.errors):`Proxmox HTTP ${res.status}`),{status:502});
  return body.data;
}
const form = obj => new URLSearchParams(Object.entries(obj).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)]));

export function proxmoxConfigured(){return !!(pveUrl&&pveTokenId&&pveSecret)}
export async function proxmoxSnapshot(){
  const resources=await pve('/cluster/resources');
  const percent=(used,total)=>typeof used==='number'&&typeof total==='number'&&total>0?Math.round(used/total*100):null;
  const guests=type=>resources.filter(r=>r.type===type).map(r=>({id:String(r.vmid),name:r.name||String(r.vmid),node:r.node,type,status:r.status,cpu:r.cpu==null?null:Math.round(r.cpu*100),memory:r.mem==null?null:r.mem,memoryPercent:percent(r.mem,r.maxmem),uptime:r.uptime??null}));
  return {nodes:resources.filter(r=>r.type==='node').map(r=>({id:r.node,name:r.node,status:r.status,cpu:r.cpu==null?null:Math.round(r.cpu*100),memory:percent(r.mem,r.maxmem),memoryPercent:percent(r.mem,r.maxmem),cores:r.maxcpu??null,memoryBytes:r.mem??null,memoryTotal:r.maxmem??null,uptime:r.uptime??null})),
    vms:guests('qemu'),lxc:guests('lxc'),
    storage:resources.filter(r=>r.type==='storage').map(r=>({id:r.id,node:r.node,storage:r.storage,name:r.storage,type:r.plugintype??'Proxmox',status:r.status,capacity:r.maxdisk??null,used:r.disk??null,available:r.maxdisk==null?null:r.maxdisk-(r.disk||0),usage:percent(r.disk,r.maxdisk)}))};
}
export async function proxmoxVmAction(node,id,action,payload={}){
  const statusActions=new Set(['start','stop','shutdown','reboot','reset','suspend','resume']);
  if(statusActions.has(action)) return pve(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/status/${action}`,{method:'POST'});
  if(action==='snapshot') return pve(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/snapshot`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({snapname:payload.name||`homecloud-${Date.now()}`,description:payload.description||'Created by HomeCloud Hub',vmstate:payload.vmstate?1:0})});
  if(action==='delete-snapshot') return pve(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/snapshot/${encodeURIComponent(payload.name)}`,{method:'DELETE'});
  if(action==='clone') return pve(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}/clone`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({newid:payload.newid,name:payload.name,target:payload.target,full:payload.full===false?0:1,storage:payload.storage})});
  if(action==='delete') return pve(`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(id)}`,{method:'DELETE'});
  throw new Error(`Unsupported Proxmox VM action: ${action}`);
}
export async function proxmoxCreateVm(payload){
  const node=payload.node; if(!node) throw new Error('node required');
  const vmid=payload.vmid || await pve('/cluster/nextid');
  const storage=payload.storage||process.env.PROXMOX_DEFAULT_STORAGE||'local-lvm';
  const diskGB=Number(payload.disk||40);
  const body=form({
    vmid, name:payload.name, cores:Number(payload.cores||2), memory:Number(payload.memory||4096),
    scsihw:'virtio-scsi-pci', scsi0:`${storage}:${diskGB}`, net0:`virtio,bridge=${payload.bridge||'vmbr0'}`,
    ostype:payload.ostype||'l26', agent:1, onboot:payload.onboot?1:0
  });
  const task=await pve(`/nodes/${encodeURIComponent(node)}/qemu`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  return {vmid:String(vmid),task};
}
export async function proxmoxBackup(payload){
  const node=payload.node; if(!node)throw new Error('node required');
  return pve(`/nodes/${encodeURIComponent(node)}/vzdump`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({
    vmid:payload.vmid, storage:payload.storage, mode:payload.mode||'snapshot', compress:payload.compress||'zstd', 'notes-template':payload.notes||'HomeCloud Hub'
  })});
}

const dockerUrl=process.env.DOCKER_API_URL?.replace(/\/$/,'');
export function dockerConfigured(){return !!dockerUrl}
function dockerTls(){
  const read=name=>process.env[name]?fs.readFileSync(process.env[name]):undefined;
  if(Boolean(process.env.DOCKER_TLS_CERT)!==Boolean(process.env.DOCKER_TLS_KEY))throw new Error('Docker TLS certificate and key must be configured together');
  return {ca:read('DOCKER_TLS_CA'),cert:read('DOCKER_TLS_CERT'),key:read('DOCKER_TLS_KEY')};
}
export async function docker(path,init={}){
  if(!dockerUrl) throw Object.assign(new Error('Docker API is not configured'),{status:503});
  const res=await request(`${dockerUrl}${path}`,init,dockerTls());
  if(!res.ok && res.status!==304) {
    const text=await res.text().catch(()=> '');
    throw new Error(`Docker HTTP ${res.status}${text?`: ${text}`:''}`);
  }
  const text=await res.text();
  if(!text)return {};
  if(path.startsWith('/images/create?')||path.startsWith('/events?')){
    const events=text.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
    const failed=events.find(event=>event.error||event.errorDetail);
    if(failed)throw new Error(failed.error||failed.errorDetail.message||'Image pull failed');
    return events;
  }
  return JSON.parse(text);
}
export async function dockerSnapshot(){
  const [containers,images,info,networks,volumes]=await Promise.all([docker('/containers/json?all=1'),docker('/images/json'),docker('/info'),docker('/networks'),docker('/volumes')]);
  const measured=[];
  for(let i=0;i<containers.length;i+=5){
    measured.push(...await Promise.all(containers.slice(i,i+5).map(async c=>{
      let stats=null,statsError=null;
      if(c.State==='running'){try{stats=await docker(`/containers/${encodeURIComponent(c.Id)}/stats?stream=false`)}catch(e){statsError=e.message;}}
      const cpuDelta=stats?stats.cpu_stats.cpu_usage.total_usage-(stats.precpu_stats?.cpu_usage?.total_usage||0):0;
      const systemDelta=stats?stats.cpu_stats.system_cpu_usage-(stats.precpu_stats?.system_cpu_usage||0):0;
      const cpu=stats&&systemDelta>0?Math.round(cpuDelta/systemDelta*(stats.cpu_stats.online_cpus||stats.cpu_stats.cpu_usage.percpu_usage?.length||1)*1000)/10:null;
      return {id:c.Id,name:(c.Names?.[0]||c.Id).replace(/^\//,''),image:c.Image,status:c.State,ports:(c.Ports||[]).map(p=>p.PublicPort?`${p.PublicPort}:${p.PrivatePort}`:String(p.PrivatePort)).join(', '),cpu,memory:stats?.memory_stats?.usage??null,memoryPercent:stats?.memory_stats?.limit?Math.round(stats.memory_stats.usage/stats.memory_stats.limit*100):null,statsError,labels:c.Labels||{}};
    })));
  }
  return {
    host:{hostname:info.Name,version:info.ServerVersion,cores:info.NCPU,memoryTotal:info.MemTotal,os:info.OperatingSystem},containers:measured,
    images:images.map(i=>({id:i.Id,name:i.RepoTags?.join(', ')||i.Id,size:i.Size,created:i.Created})),
    networks:networks.map(n=>({id:n.Id,name:n.Name,driver:n.Driver,scope:n.Scope,subnets:n.IPAM?.Config?.map(c=>c.Subnet).join(', ')||'',internal:n.Internal})),
    volumes:(volumes.Volumes||[]).map(v=>({id:v.Name,name:v.Name,driver:v.Driver,mountpoint:v.Mountpoint,scope:v.Scope})),
    stacks:[...new Set(measured.map(c=>c.labels['com.docker.compose.project']).filter(Boolean))].map(name=>({id:name,name,containers:measured.filter(c=>c.labels['com.docker.compose.project']===name).length}))
  };
}
export async function dockerAction(id,action,payload={}){
  if(['start','stop','restart','pause','unpause','kill'].includes(action)) return docker(`/containers/${encodeURIComponent(id)}/${action}`,{method:'POST'});
  if(action==='remove') return docker(`/containers/${encodeURIComponent(id)}?force=${payload.force?'true':'false'}&v=${payload.volumes?'true':'false'}`,{method:'DELETE'});
  if(action==='rename') return docker(`/containers/${encodeURIComponent(id)}/rename?name=${encodeURIComponent(payload.name)}`,{method:'POST'});
  throw new Error(`Unsupported Docker action: ${action}`);
}
export async function dockerCreateContainer(payload){
  if(!payload.name||!payload.image)throw new Error('Container name and image are required');
  if(payload.ports){
    const match=String(payload.ports).match(/^(\d+):(\d+)$/);
    if(!match)throw new Error('Port mapping must be HOST_PORT:CONTAINER_PORT');
    payload={...payload,port:match[1],containerPort:match[2]};
  }
  for(const port of [payload.port,payload.containerPort]){
    if(port!==undefined&&(!Number.isInteger(Number(port))||Number(port)<1||Number(port)>65535))throw new Error('Ports must be integers between 1 and 65535');
  }
  const body={
    Image:payload.image,
    Env:Array.isArray(payload.env)?payload.env:[],
    Labels:{'homecloud.managed':'true'},
    HostConfig:{
      RestartPolicy:{Name:payload.restartPolicy||'unless-stopped'},
      PortBindings:{}
    },
    ExposedPorts:{}
  };
  if(payload.port && payload.containerPort){
    body.ExposedPorts[`${payload.containerPort}/tcp`]={};
    body.HostConfig.PortBindings[`${payload.containerPort}/tcp`]=[{HostPort:String(payload.port)}];
  }
  await docker(`/images/create?fromImage=${encodeURIComponent(payload.image)}`,{method:'POST',timeoutMs:Number(process.env.ACTION_TIMEOUT_MS)||300000});
  const created=await docker(`/containers/create?name=${encodeURIComponent(payload.name)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  await docker(`/containers/${created.Id}/start`,{method:'POST'});
  return created;
}
export async function dockerLogs(id,tail=200){
  if(!dockerUrl)throw new Error('Docker API is not configured');
  if(!Number.isInteger(tail)||tail<1||tail>10000)throw new Error('Log tail must be between 1 and 10000');
  const res=await request(`${dockerUrl}/containers/${encodeURIComponent(id)}/logs?stdout=1&stderr=1&timestamps=1&tail=${tail}`,{},dockerTls());
  if(!res.ok)throw new Error(`Docker HTTP ${res.status}`);
  const data=res.buffer;
  if(data.length>=8 && [0,1,2].includes(data[0]) && data[1]===0 && data[2]===0 && data[3]===0){
    let offset=0;const frames=[];
    while(offset+8<=data.length){const size=data.readUInt32BE(offset+4);if(offset+8+size>data.length)throw new Error('Incomplete Docker log frame');frames.push(data.subarray(offset+8,offset+8+size));offset+=8+size;}
    return Buffer.concat(frames).toString('utf8');
  }
  return await res.text();
}
export async function dockerPrune(kind){
  const map={containers:'/containers/prune',images:'/images/prune',volumes:'/volumes/prune',networks:'/networks/prune'};
  if(!map[kind])throw new Error('Invalid prune kind');
  return docker(map[kind],{method:'POST'});
}
