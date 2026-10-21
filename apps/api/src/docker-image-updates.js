import {notifier} from './notifications.js';
import crypto from 'node:crypto';
import {docker} from './connectors.js';
import {agentContext} from './node-agents.js';
import {monitoredDocker} from './docker-fleet.js';
import {get,mutate} from './store.js';
export const trackedImageLabel='io.homecloud.update.image';
export const updateDefaults={enabled:true,intervalHours:6};
export const digestPattern=/^sha256:[a-f0-9]{64}$/;
const imageReference=/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,254}$/;
export function imageRepository(ref){const last=ref.lastIndexOf('/'),colon=ref.lastIndexOf(':');return colon>last?ref.slice(0,colon):ref;}
const normalize=ref=>{let r=imageRepository(ref).replace(/^index\.docker\.io\//,'docker.io/');if(!r.includes('/')||!/[.:]/.test(r.split('/')[0])&&r.split('/')[0]!=='localhost')r='docker.io/'+r;if(r.startsWith('docker.io/')&&r.split('/').length===2)r=r.replace('docker.io/','docker.io/library/');return r;};
export function compareImage(local,remote,ref){
 if(!imageReference.test(ref)||ref.includes('@')||/^sha256:/.test(ref))return {status:'unsupported',detail:'Use a registry tag to track updates. Digest-pinned and local-only images do not follow a tag.'};
 const digests=(local.RepoDigests||[]).filter(r=>normalize(r.split('@')[0])===normalize(ref)).map(r=>r.split('@')[1]).filter(d=>digestPattern.test(d));
 if(!digests.length)return {status:'unknown',detail:'This image has no matching local registry digest. Its update status cannot be established.'};
 if(!digestPattern.test(remote?.Descriptor?.digest))return {status:'unknown',detail:'The registry did not return a supported image digest.'};
 return {status:digests.includes(remote.Descriptor.digest)?'current':'available',localDigests:digests,remoteDigest:remote.Descriptor.digest,detail:digests.includes(remote.Descriptor.digest)?'The tracked registry digest matches this image.':'The tracked tag has a different registry digest.'};
}
export function registryCheckFailure(error,phase='registry'){
 const message=String(error?.message||''),http=error?.dockerStatus;
 let code='registry-unavailable',detail='The image update check failed. Retry Check for Updates; check registry access from this Docker host if it persists.',retryable=false;
 if(/offline|not configured|unavailable.*host/i.test(message)){code='host-unavailable';detail='The selected Docker host is unavailable. Check its connection under Settings → Connections.'}
 else if(/unsupported.*(path|request)|invalid docker path/i.test(message)){code='connector-update';detail='The paired connector cannot relay registry checks. Update Connector under Settings → Connections, then retry.'}
 else if(http===429||/toomanyrequests|rate.?limit|too many requests/i.test(message)){code='registry-rate-limit';detail='The registry is limiting update checks. Wait before retrying; registry authentication may increase the allowed limit.'}
 else if([401,403].includes(http)||/unauthorized|authentication required|denied|forbidden/i.test(message)){code='registry-auth';detail='The registry refused access to this image. Check repository permissions and registry authentication on the Docker host.'}
 else if(/x509|certificate|tls handshake/i.test(message)){code='registry-tls';detail='The Docker host could not verify the registry TLS connection. Check its clock and trusted registry certificates.'}
 else if(/no such host|ENOTFOUND|EAI_AGAIN|name resolution|lookup .*no such/i.test(message)){code='registry-dns';detail='The Docker host could not resolve the registry address. Check its DNS configuration.';retryable=true}
 else if(/timed? ?out|timeout|expired|deadline/i.test(message)){code='registry-timeout';detail='The registry check timed out. The Docker connection can still be healthy. Retry, then check registry access from that host if it persists.';retryable=true}
 else if(http===404||/manifest unknown|name unknown|not found/i.test(message)){code=phase==='image'?'local-image-missing':'registry-image-missing';detail=phase==='image'?'The installed image is no longer available locally. Refresh the container inventory and retry.':'The registry could not find this repository or tag. Check the image reference and repository access.'}
 else if(http>=500||/ECONNRESET|ECONNREFUSED|socket hang up|connection reset|connection refused/i.test(message)){code='registry-unavailable';detail='The registry lookup failed on the Docker host. Its connection to i-Clusters can still be healthy. Check registry availability and outbound network access.';retryable=true}
 return {status:'unknown',code,detail,retryable};
}
export async function readUpdateHost(query=docker){
 const [containers,info]=await Promise.all([query('/containers/json?all=1',{timeoutMs:30000}),query('/info',{timeoutMs:30000})]);
 if(!Array.isArray(containers)||!info||Array.isArray(info)||typeof info.Name!=='string')throw Error('Invalid Docker inventory response');
 return {host:{hostname:info.Name,engineId:info.ID},containers:containers.map(c=>({id:c.Id,name:(c.Names?.[0]||c.Id).replace(/^\//,''),image:c.Labels?.[trackedImageLabel]||c.Image,imageId:c.ImageID}))};
}
export function createDockerImageUpdates({persistence={get,mutate},query=docker,now=Date.now,notify=async()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),readHost=()=>readUpdateHost(query),scanBudgetMs=120000,inventoryBudgetMs=30000}={}){
 let lastSnapshot=null,lastSignature='',version=0;const pending=new Map(),hostReads=new Map(),hostVersions=new Map(),hostProgress=new Map(),hostRequestedAt=new Map();
 const settings=()=>({...updateDefaults,...persistence.get().dockerImageUpdates?.settings});
 const status=(host)=>{const data=persistence.get().dockerImageUpdates||{};return {settings:settings(),checking:host===undefined?pending.size+hostReads.size>0:pending.has('all')||pending.has(host||'direct')||hostReads.has(host||'direct'),manualChecking:host===undefined?hostReads.size>0:[host||'direct'].some(h=>hostReads.has(h)||pending.has(h)),progress:hostProgress.get(host||'direct')||null,error:data.hostErrors?.[host||'direct']||'',lastChecked:host===undefined?data.lastChecked||null:data.hostChecked?.[host||'direct']||null,rows:(data.rows||[]).filter(r=>host===undefined||r.hostId===(host||'direct'))}};
 const saveSettings=input=>{if(!input||typeof input.enabled!=='boolean'||![1,6,12,24].includes(input.intervalHours)||Object.keys(input).some(k=>!['enabled','intervalHours'].includes(k)))throw Object.assign(Error('Choose an enabled state and a supported update interval.'),{status:400});persistence.mutate(s=>{s.dockerImageUpdates??={};s.dockerImageUpdates.settings={...input}});return status()};
 const observe=(snapshot,force=false,onlyHost=null)=>{
  const scope=onlyHost||'all';
  if(snapshot?.refreshing)return status();
  if(snapshot&&!onlyHost)lastSnapshot=snapshot;
  if(pending.has(scope))return status();
  const prior=persistence.get().dockerImageUpdates||{},signature=(snapshot||lastSnapshot)?JSON.stringify(monitoredDocker(snapshot||lastSnapshot).map(c=>[c.hostId,c.id,c.imageId]).sort()):'';
  if(!(snapshot||lastSnapshot)||!force&&(!settings().enabled||signature===lastSignature&&now()-Date.parse(prior.lastChecked||0)<settings().intervalHours*3600000))return status();
  if(!onlyHost)lastSignature=signature;const scanning=snapshot||lastSnapshot;
  const eligible=host=>onlyHost?host===onlyHost:!hostReads.has(host)&&!pending.has(host)&&(!scanning.sampledAt||Date.parse(scanning.sampledAt)>=(hostRequestedAt.get(host)||0));
  const rows=monitoredDocker(scanning).filter(c=>eligible(c.hostId)&&!String(c.name||'').startsWith('homecloud-backup-'));
  const previous=new Map((prior.rows||[]).filter(r=>eligible(r.hostId)).map(r=>[r.hostId+':'+r.containerId,r])),results=[],cache=new Map();
  // Resume deferred images first so repeated bounded checks cannot starve them.
  rows.sort((a,b)=>Number(previous.get(b.hostId+':'+b.id)?.code==='registry-scan-deferred')-Number(previous.get(a.hostId+':'+a.id)?.code==='registry-scan-deferred'));
  const affected=new Set([...previous.values()].map(r=>r.hostId).concat(rows.map(r=>r.hostId),onlyHost?[onlyHost]:[])),epochs=new Map([...affected].map(h=>[h,hostVersions.get(h)||0]));
  const valid=h=>epochs.get(h)===(hostVersions.get(h)||0);
  const started=version,deadline=Date.now()+scanBudgetMs;
  const bounded=async(work,maximum)=>{const remaining=Math.min(maximum,deadline-Date.now());if(remaining<=0)throw Error('Registry scan deadline exceeded');let timer;try{return await Promise.race([Promise.resolve().then(()=>work(remaining)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Registry scan deadline exceeded')),remaining)})]);}finally{clearTimeout(timer)}};
  const work=(async()=>{
   const check=async c=>{
    const row={hostId:c.hostId,host:c.host,node:c.node,containerId:c.id,name:c.name,image:c.image,imageId:c.imageId,checkedAt:new Date(now()).toISOString()};
    if(typeof c.image!=='string'||!c.imageId||!imageReference.test(c.image)||c.image.includes('@')||/^sha256:/.test(c.image)){results.push({...row,status:'unsupported',detail:'Digest-pinned or local-only image. Change its reference explicitly to update it.'});return}
    if(Date.now()>=deadline){results.push({...row,status:'unknown',code:'registry-scan-deferred',detail:'The scan reached its time budget before this image could be checked. Retry Check for Updates; deferred images are checked first and existing alerts are retained.'});return}
    const key=c.hostId+':'+c.imageId+':'+c.image;
    if(!cache.has(key))cache.set(key,agentContext.run({host:c.hostId==='direct'?'':c.hostId},async()=>{
     let local;try{local=await bounded(timeoutMs=>query('/images/'+encodeURIComponent(c.imageId)+'/json',{timeoutMs}),10000)}catch(error){const {retryable,...failure}=registryCheckFailure(error,'image');return failure}
     for(let attempt=0;attempt<2;attempt++)try{const remote=await bounded(timeoutMs=>query('/distribution/'+encodeURIComponent(c.image)+'/json',{timeoutMs}),15000);return compareImage(local,remote,c.image)}catch(error){const {retryable,...failure}=registryCheckFailure(error);if(!retryable||attempt===1||Date.now()+1000>=deadline)return failure;await bounded(()=>sleep(1000),1500)}
    }));
    results.push({...row,...await cache.get(key)});
   };
   const publish=()=>{if(started!==version)return;for(const host of affected)if(valid(host))hostProgress.set(host,{stage:'registry',completed:results.filter(r=>r.hostId===host).length,total:rows.filter(r=>r.hostId===host).length});persistence.mutate(s=>{s.dockerImageUpdates??={};const accepted=results.filter(r=>valid(r.hostId)),keys=new Set(accepted.map(r=>r.hostId+':'+r.containerId));s.dockerImageUpdates.rows=[...(s.dockerImageUpdates.rows||[]).filter(r=>!keys.has(r.hostId+':'+r.containerId)),...accepted]})};
   await new Promise(resolve=>{const queue=[...rows],perHost=new Map();let active=0;
    const pump=()=>{while(active<4){const index=queue.findIndex(c=>(perHost.get(c.hostId)||0)<2);if(index<0)break;const [c]=queue.splice(index,1);active++;perHost.set(c.hostId,(perHost.get(c.hostId)||0)+1);
     Promise.resolve().then(()=>check(c)).catch(()=>{results.push({hostId:c.hostId,containerId:c.id,name:c.name,image:c.image,imageId:c.imageId,checkedAt:new Date(now()).toISOString(),status:'unknown',code:'registry-timeout',detail:'The update scan could not finish this image. Retry Check for Updates; existing alerts are retained.'})}).finally(()=>{publish();active--;perHost.set(c.hostId,perHost.get(c.hostId)-1);pump()});
    }if(!queue.length&&!active)resolve();};pump();});
   // Keep prior observations when a host is absent/offline. An absent reading is not proof of recovery.
   const retired=host=>host==='direct'?scanning.services?.some(s=>s.id==='docker'&&s.status==='not-configured'):Array.isArray(scanning.dockerFleet?.connectors)&&!scanning.dockerFleet.connectors.some(n=>n.id===host.split(':')[0]);
   const keys=new Set(results.map(r=>r.hostId+':'+r.containerId));
   const reachable=new Set([...(scanning.docker?['direct']:[]),...(scanning.dockerFleet?.hosts||[]).filter(h=>h.status==='reachable').map(h=>h.id)]);
   for(const [key,row] of previous)if(!keys.has(key)&&!reachable.has(row.hostId)&&!retired(row.hostId)){
    const host=scanning.dockerFleet?.hosts?.find(h=>h.id===row.hostId),failure=host?.failure||host?.error;
    results.push({...row,status:'unknown',code:'host-inventory-unavailable',detail:failure?`Docker guest inventory could not be read. ${failure} The earlier update alert is retained until a fresh check succeeds.`:'No fresh Docker guest inventory was available in the monitoring scan. A healthy parent connector does not verify this guest. Use Check for Updates on this host; earlier update alerts are retained.'});
   }
   if(started!==version)return;
   persistence.mutate(s=>{
    for(const priorRow of previous.values())if(valid(priorRow.hostId)&&!keys.has(priorRow.hostId+':'+priorRow.containerId)&&(reachable.has(priorRow.hostId)||retired(priorRow.hostId))){const prefix=`docker-image:${priorRow.hostId}:${priorRow.containerId}:`;for(const alert of s.alerts||[])if(alert.key?.startsWith(prefix)&&alert.status!=='resolved'){alert.status='resolved';alert.resolvedAt=new Date(now()).toISOString()}}
    const accepted=results.filter(r=>valid(r.hostId)),checkedAt=new Date(now()).toISOString(),hostChecked={...s.dockerImageUpdates?.hostChecked},hostErrors={...s.dockerImageUpdates?.hostErrors};for(const h of affected)if(valid(h)){hostChecked[h]=checkedAt;if(reachable.has(h))delete hostErrors[h]}
    s.dockerImageUpdates={...s.dockerImageUpdates,hostChecked,hostErrors,rows:[...(s.dockerImageUpdates?.rows||[]).filter(r=>!affected.has(r.hostId)||!valid(r.hostId)),...accepted],...(!onlyHost?{lastChecked:checkedAt}:{})};s.alerts??=[];
    for(const row of results.filter(r=>valid(r.hostId))){
     if(!['available','current'].includes(row.status))continue;
     const prefix=`docker-image:${row.hostId}:${row.containerId}:`,key=prefix+row.remoteDigest;
     for(const alert of s.alerts)if(alert.key?.startsWith(prefix)&&alert.status!=='resolved'&&(row.status==='current'||alert.key!==key)){alert.status='resolved';alert.resolvedAt=row.checkedAt;}
     if(row.status==='available'&&!s.alerts.some(a=>a.key===key))s.alerts.unshift({id:crypto.randomUUID(),key,title:'Docker image update available',source:`${row.host} / ${row.name}`,provider:'docker',updateHost:row.hostId,updateContainer:row.containerId,severity:'info',status:'active',triggered:row.checkedAt,lastSeen:row.checkedAt,details:`${row.image} has a new registry digest (${row.remoteDigest}). Open Docker → Updates on ${row.host} to review, pull and install it. No update was installed automatically.`});
    }
    s.alerts=s.alerts.slice(0,1000);
   });
   await notify(persistence.get().alerts);
  })().catch(()=>{}).finally(()=>{pending.delete(scope);for(const host of affected)if(valid(host))hostProgress.delete(host)});pending.set(scope,work);
  return status();
 };
 const checkHost=host=>{
  const id=host||'direct';if(hostReads.has(id)||pending.has(id))return status(host);
  hostVersions.set(id,(hostVersions.get(id)||0)+1);hostRequestedAt.set(id,now());hostProgress.set(id,{stage:'inventory',completed:0,total:null});
  const work=Promise.resolve().then(()=>agentContext.run({host:id==='direct'?'':id},async()=>{
   let snapshot,inventoryError='';
   try{let timer;const data=await Promise.race([Promise.resolve().then(readHost),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Docker inventory timed out')),inventoryBudgetMs)})]).finally(()=>clearTimeout(timer));snapshot=id==='direct'?{docker:data,services:[]}:{dockerFleet:{hosts:[{id,status:'reachable',inventory:data}]}}}
   catch(error){const message=String(error?.message||''),detail=/timed? ?out|timeout|expired|deadline/i.test(message)?'The guest inventory request timed out. Check this guest’s Docker service and connector access.':[401,403].includes(error?.dockerStatus)?'The guest Docker API refused inventory access. Check its Docker permissions.':/offline|unavailable/i.test(message)?'This Docker guest is offline or unavailable through its connector.':'The Docker guest did not return a usable inventory. Check its Docker service and access through the paired connector.';inventoryError=detail;snapshot=id==='direct'?{services:[{id:'docker',status:'error'}],dockerFleet:{hosts:[{id,status:'error',failure:detail}]}}:{dockerFleet:{hosts:[{id,status:'error',failure:detail}]}}}
   persistence.mutate(s=>{s.dockerImageUpdates??={};s.dockerImageUpdates.hostErrors??={};if(inventoryError)s.dockerImageUpdates.hostErrors[id]=inventoryError;else delete s.dockerImageUpdates.hostErrors[id]});
   observe(snapshot,true,id);await pending.get(id);
  })).finally(()=>{hostReads.delete(id);hostProgress.delete(id)});hostReads.set(id,work);return status(host);
 };
 const installed=(host,id,result)=>{version++;lastSignature='';persistence.mutate(s=>{s.dockerImageUpdates??={};s.dockerImageUpdates.rows=(s.dockerImageUpdates.rows||[]).filter(r=>r.hostId!==host||r.containerId!==id);for(const alert of s.alerts||[])if(alert.key?.startsWith(`docker-image:${host}:${id}:`)&&alert.status!=='resolved'){alert.status='resolved';alert.resolvedAt=new Date(now()).toISOString()}})};
 return {status,settings:saveSettings,observe,checkHost,installed,settled:()=>Promise.all([...pending.values(),...hostReads.values()])};
}
export const dockerImageUpdates=createDockerImageUpdates({notify:alerts=>notifier.deliver(alerts)});
