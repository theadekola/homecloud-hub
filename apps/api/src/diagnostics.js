import {providers} from './monitor.js';
import {pve,docker} from './connectors.js';
import {truenas} from './infrastructure.js';
import {agentHosts,agentContext} from './node-agents.js';

export async function providerDiagnostics({sources=providers,query=pve,tn=truenas,engine=docker,hosts=agentHosts,hostId,budgetMs=20000,checkTimeoutMs=5000,concurrency=4}={}){
 const deadline=Date.now()+budgetMs,checks=[],versions={},pending=[];
 const engines=[...(sources.docker.configured()?[{id:'direct',online:true}]:[]),...hosts().filter(h=>h.online||h.status==='connected')];
 if(hostId&&!engines.some(h=>h.id===hostId))throw Object.assign(Error('Select a currently known Docker host.'),{status:400});
 const add=(provider,method,key,read,valid,versionKey)=>{const row={provider,method,status:'not-checked',message:'Diagnostic time budget reached. This read was not run. Retry one Docker host at a time.'};checks.push(row);pending.push({key,run:async()=>{
  const remaining=Math.min(checkTimeoutMs,deadline-Date.now());if(remaining<=0)return;
  let timer;try{const value=await Promise.race([Promise.resolve().then(()=>read(remaining)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Diagnostic timeout'),{code:'DIAGNOSTIC_TIMEOUT'})),remaining)})]);if(!valid(value))throw Error('Unexpected response shape');row.status='passed';delete row.message;if(versionKey)versions[versionKey]=value.version||value.Version||null;}
  catch(error){row.status='failed';row.message=error.code==='DIAGNOSTIC_TIMEOUT'||/timed out|timeout/i.test(error.message||'')?'Diagnostic read timed out; connection health is not established by this result. Retry this host separately.':'Read failed or returned an incompatible response. Check provider version, API permissions, credentials and TLS.';if(versionKey)versions[versionKey]=null;}
  finally{clearTimeout(timer)}
 }});};
 if(!hostId&&sources.proxmox.configured()){
  for(const path of ['/version','/cluster/resources','/cluster/backup','/storage'])add('proxmox',path,'proxmox',ms=>query(path,{timeoutMs:ms}),path==='/version'?r=>typeof r?.version==='string':Array.isArray,path==='/version'?'proxmox':null);
 }
 if(!hostId&&sources.truenas.configured()){
  for(const method of ['system.info','pool.query','pool.dataset.query','pool.snapshottask.query','sharing.smb.query','sharing.nfs.query','service.query','filesystem.stat'])add('truenas',method==='filesystem.stat'?'filesystem.stat (/mnt)':method,'truenas',ms=>tn(method,method==='filesystem.stat'?['/mnt']:[],undefined,{timeoutMs:ms}),method==='system.info'?r=>r&&typeof r==='object'&&!Array.isArray(r):method==='filesystem.stat'?r=>r?.type==='DIRECTORY':Array.isArray,method==='system.info'?'truenas':null);
 }
 for(const host of engines.filter(h=>!hostId||h.id===hostId)){
  const provider=`docker:${host.id}`;
  if(!host.online){checks.push({provider,method:'node-agent',status:'failed',message:'Docker host or node agent is offline.'});continue;}
  for(const route of ['/version','/containers/json?all=1','/networks','/volumes'])add(provider,route,host.agent||host.node||host.id,ms=>agentContext.run({host:host.id==='direct'?'':host.id},()=>engine(route,{timeoutMs:ms})),route==='/version'?r=>typeof r?.Version==='string':route==='/volumes'?r=>r&&('Volumes' in r):Array.isArray,route==='/version'?provider:null);
 }
 await new Promise(resolve=>{let active=0;const perNode=new Map();const pump=()=>{
  while(active<concurrency&&Date.now()<deadline){const index=pending.findIndex(job=>(perNode.get(job.key)||0)<2);if(index<0)break;const [job]=pending.splice(index,1);active++;perNode.set(job.key,(perNode.get(job.key)||0)+1);Promise.resolve().then(job.run).finally(()=>{active--;perNode.set(job.key,perNode.get(job.key)-1);pump()});}
  if((!pending.length||Date.now()>=deadline)&&!active)resolve();
 };pump()});
 return {sampledAt:new Date().toISOString(),checks,versions,complete:checks.every(c=>c.status!=='not-checked'),scope:hostId?'selected-docker-host':'all-configured-providers',configured:Object.entries(sources).filter(([,s])=>s.configured()).map(([name])=>name),writesVerified:false,note:'These bounded checks only read APIs. Timed-out or unrun checks are not a provider outage verdict. A passing result does not verify provider writes, client access to shares, or restore outcomes.'};
}
