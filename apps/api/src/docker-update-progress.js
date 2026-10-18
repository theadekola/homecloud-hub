// Short-lived, owner- and host-scoped observations. This never starts an installation.
export function createDockerUpdateProgress({now=Date.now,limit=200,ttl=3600000}={}){
 const entries=new Map(),valid=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(id);
 const key=(user,host,container,id)=>JSON.stringify([user,host,container,id]);
 const prune=()=>{for(const [k,v] of entries)if(now()-v.touched>ttl&&v.status!=='running')entries.delete(k)};
 return {
  start(user,host,container,id){
   if(!valid(id))throw Object.assign(Error('Invalid installation progress identifier.'),{status:400});
   prune();if(entries.size>=limit){const oldest=[...entries].find(([,v])=>v.status!=='running');if(oldest)entries.delete(oldest[0]);else throw Object.assign(Error('Too many installations are being tracked. Retry shortly.'),{status:429})}
   const k=key(user,host,container,id),entry={percent:0,stage:'Checking reviewed configuration',status:'running',startedAt:new Date(now()).toISOString(),touched:now()};
   if(entries.get(k)?.status==='running')throw Object.assign(Error('This installation request is already running.'),{status:409});
   if([...entries.values()].some(v=>v.status==='running'&&v.host===host&&v.container===container))throw Object.assign(Error('An update is already running for this container.'),{status:409});
   entry.host=host;entry.container=container;entries.set(k,entry);
   return {
    report(percent,stage){if(entry.status!=='running')return;entry.percent=Math.max(entry.percent,Math.min(99,percent));entry.stage=stage;entry.touched=now()},
    finish(result){if(result)entry.result=structuredClone(result);entry.percent=100;entry.stage='Update installed and verified';entry.status='completed';entry.touched=now()},
    fail(message){if(message)entry.error=String(message).slice(0,1000);entry.status='failed';entry.stage='Installation failed. Review the result below before retrying.';entry.touched=now()},
   };
  },
  read(user,host,container,id){prune();const entry=valid(id)?entries.get(key(user,host,container,id)):null;if(!entry)return {progress:null};const {touched,host:ignoredHost,container:ignoredContainer,...progress}=entry;return {progress:{...progress,updatedAt:new Date(touched).toISOString()}}},
 };
}
