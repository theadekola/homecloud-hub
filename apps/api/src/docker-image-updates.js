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
 else if(http>=500||/ECONNRESET|ECONNREFUSED|socket hang up|connection reset|connection refused/i.test(message)){code='registry-unavailable';detail='The registry lookup failed on the Docker host. Its connection to HomeCloud can still be healthy. Check registry availability and outbound network access.';retryable=true}
 return {status:'unknown',code,detail,retryable};
}
export function createDockerImageUpdates({persistence={get,mutate},query=docker,now=Date.now,notify=async()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let pending=null,lastSnapshot=null,lastSignature='',version=0;
 const settings=()=>({...updateDefaults,...persistence.get().dockerImageUpdates?.settings});
 const status=(host)=>{const data=persistence.get().dockerImageUpdates||{};return {settings:settings(),checking:!!pending,lastChecked:data.lastChecked||null,rows:(data.rows||[]).filter(r=>host===undefined||r.hostId===(host||'direct'))}};
 const saveSettings=input=>{if(!input||typeof input.enabled!=='boolean'||![1,6,12,24].includes(input.intervalHours)||Object.keys(input).some(k=>!['enabled','intervalHours'].includes(k)))throw Object.assign(Error('Choose an enabled state and a supported update interval.'),{status:400});persistence.mutate(s=>{s.dockerImageUpdates??={};s.dockerImageUpdates.settings={...input}});return status()};
 const observe=(snapshot,force=false)=>{
  if(snapshot?.refreshing)return status();
  if(snapshot)lastSnapshot=snapshot;
  if(pending)return status();
  const prior=persistence.get().dockerImageUpdates||{},signature=lastSnapshot?JSON.stringify(monitoredDocker(lastSnapshot).map(c=>[c.hostId,c.id,c.imageId]).sort()):'';
  if(!lastSnapshot||!force&&(!settings().enabled||signature===lastSignature&&now()-Date.parse(prior.lastChecked||0)<settings().intervalHours*3600000))return status();
  lastSignature=signature;const scanning=lastSnapshot;
  const rows=monitoredDocker(scanning).filter(c=>!String(c.name||'').startsWith('homecloud-backup-'));
  const previous=new Map((prior.rows||[]).map(r=>[r.hostId+':'+r.containerId,r])),results=[],cache=new Map();
  const started=version;pending=(async()=>{
   const check=async c=>{
    const row={hostId:c.hostId,host:c.host,node:c.node,containerId:c.id,name:c.name,image:c.image,imageId:c.imageId,checkedAt:new Date(now()).toISOString()};
    if(typeof c.image!=='string'||!c.imageId||!imageReference.test(c.image)||c.image.includes('@')||/^sha256:/.test(c.image)){results.push({...row,status:'unsupported',detail:'Digest-pinned or local-only image. Change its reference explicitly to update it.'});return}
    const key=c.hostId+':'+c.imageId+':'+c.image;
    if(!cache.has(key))cache.set(key,agentContext.run({host:c.hostId==='direct'?'':c.hostId},async()=>{
     let local;try{local=await query('/images/'+encodeURIComponent(c.imageId)+'/json',{timeoutMs:20000})}catch(error){const {retryable,...failure}=registryCheckFailure(error,'image');return failure}
     for(let attempt=0;attempt<2;attempt++)try{const remote=await query('/distribution/'+encodeURIComponent(c.image)+'/json',{timeoutMs:45000});return compareImage(local,remote,c.image)}catch(error){const {retryable,...failure}=registryCheckFailure(error);if(!retryable||attempt===1)return failure;await sleep(1000)}
    }));
    results.push({...row,...await cache.get(key)});
   };
   for(let i=0;i<rows.length;i+=2)await Promise.all(rows.slice(i,i+2).map(check));
   // Keep prior observations when a host is absent/offline. An absent reading is not proof of recovery.
   const retired=host=>host==='direct'?scanning.services?.some(s=>s.id==='docker'&&s.status==='not-configured'):Array.isArray(scanning.dockerFleet?.connectors)&&!scanning.dockerFleet.connectors.some(n=>n.id===host.split(':')[0]);
   const keys=new Set(results.map(r=>r.hostId+':'+r.containerId));
   const reachable=new Set([...(scanning.docker?['direct']:[]),...(scanning.dockerFleet?.hosts||[]).filter(h=>h.status==='reachable').map(h=>h.id)]);
   for(const [key,row] of previous)if(!keys.has(key)&&!reachable.has(row.hostId)&&!retired(row.hostId))results.push({...row,status:'unknown',detail:'Host not checked. Its prior update remains unresolved until a fresh reading is available.'});
   if(started!==version)return;
   persistence.mutate(s=>{
    for(const priorRow of previous.values())if(!keys.has(priorRow.hostId+':'+priorRow.containerId)&&(reachable.has(priorRow.hostId)||retired(priorRow.hostId))){const prefix=`docker-image:${priorRow.hostId}:${priorRow.containerId}:`;for(const alert of s.alerts||[])if(alert.key?.startsWith(prefix)&&alert.status!=='resolved'){alert.status='resolved';alert.resolvedAt=new Date(now()).toISOString()}}
    s.dockerImageUpdates={...s.dockerImageUpdates,rows:results,lastChecked:new Date(now()).toISOString()};s.alerts??=[];
    for(const row of results){
     if(!['available','current'].includes(row.status))continue;
     const prefix=`docker-image:${row.hostId}:${row.containerId}:`,key=prefix+row.remoteDigest;
     for(const alert of s.alerts)if(alert.key?.startsWith(prefix)&&alert.status!=='resolved'&&(row.status==='current'||alert.key!==key)){alert.status='resolved';alert.resolvedAt=row.checkedAt;}
     if(row.status==='available'&&!s.alerts.some(a=>a.key===key))s.alerts.unshift({id:crypto.randomUUID(),key,title:'Docker image update available',source:`${row.host} / ${row.name}`,provider:'docker',updateHost:row.hostId,updateContainer:row.containerId,severity:'info',status:'active',triggered:row.checkedAt,lastSeen:row.checkedAt,details:`${row.image} has a new registry digest (${row.remoteDigest}). Open Docker → Updates on ${row.host} to review, pull and install it. No update was installed automatically.`});
    }
    s.alerts=s.alerts.slice(0,1000);
   });
   await notify(persistence.get().alerts);
  })().catch(()=>{}).finally(()=>{pending=null});
  return status();
 };
 const installed=(host,id,result)=>{version++;lastSignature='';persistence.mutate(s=>{s.dockerImageUpdates??={};s.dockerImageUpdates.rows=(s.dockerImageUpdates.rows||[]).filter(r=>r.hostId!==host||r.containerId!==id);for(const alert of s.alerts||[])if(alert.key?.startsWith(`docker-image:${host}:${id}:`)&&alert.status!=='resolved'){alert.status='resolved';alert.resolvedAt=new Date(now()).toISOString()}})};
 return {status,settings:saveSettings,observe,installed,settled:()=>pending||Promise.resolve()};
}
export const dockerImageUpdates=createDockerImageUpdates({notify:alerts=>notifier.deliver(alerts)});
