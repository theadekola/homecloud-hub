import {providers} from './monitor.js';
import {pve,docker} from './connectors.js';
import {truenas} from './infrastructure.js';
import {agentHosts,agentContext} from './node-agents.js';

export async function providerDiagnostics({sources=providers,query=pve,tn=truenas,engine=docker,hosts=agentHosts}={}){
 const checks=[],versions={};
 const check=async(provider,method,read,valid)=>{
  try{const value=await read();if(!valid(value))throw Error('Unexpected response shape');checks.push({provider,method,status:'passed'});return value;}
  catch{checks.push({provider,method,status:'failed',message:'Read failed or returned an incompatible response. Check provider version, API permissions, credentials and TLS.'});return null;}
 };
 await Promise.all([
  (async()=>{if(!sources.proxmox.configured())return;
   const v=await check('proxmox','/version',()=>query('/version'),r=>typeof r?.version==='string');versions.proxmox=v?.version||null;
   await check('proxmox','/cluster/resources',()=>query('/cluster/resources'),Array.isArray);
   await check('proxmox','/cluster/backup',()=>query('/cluster/backup'),Array.isArray);
   await check('proxmox','/storage',()=>query('/storage'),Array.isArray);
  })(),
  (async()=>{if(!sources.truenas.configured())return;
   const info=await check('truenas','system.info',()=>tn('system.info'),r=>r&&typeof r==='object'&&!Array.isArray(r));versions.truenas=info?.version||null;
   for(const method of ['pool.query','pool.dataset.query','pool.snapshottask.query','sharing.smb.query','sharing.nfs.query','service.query'])
    await check('truenas',method,()=>tn(method),Array.isArray);
   await check('truenas','filesystem.stat (/mnt)',()=>tn('filesystem.stat',['/mnt']),r=>r?.type==='DIRECTORY');
  })(),
  (async()=>{
   const engines=[...(sources.docker.configured()?[{id:'direct',online:true}]:[]),...hosts().filter(h=>h.online||h.status==='connected')];
   for(const host of engines){const provider=`docker:${host.id}`;
    if(!host.online){checks.push({provider,method:'node-agent',status:'failed',message:'Docker host or node agent is offline.'});continue;}
    await agentContext.run({host:host.id==='direct'?'':host.id},async()=>{
     const v=await check(provider,'/version',()=>engine('/version',{timeoutMs:15000}),r=>typeof r?.Version==='string');versions[provider]=v?.Version||null;
     for(const path of ['/containers/json?all=1','/networks'])await check(provider,path,()=>engine(path,{timeoutMs:15000}),Array.isArray);
     await check(provider,'/volumes',()=>engine('/volumes',{timeoutMs:15000}),r=>r&&('Volumes' in r));
    });
   }
  })()
 ]);
 return {sampledAt:new Date().toISOString(),checks,versions,configured:Object.entries(sources).filter(([,s])=>s.configured()).map(([name])=>name),
  writesVerified:false,note:'These checks only read APIs. A passing result does not verify provider writes, client access to shares, or restore outcomes.'};
}
