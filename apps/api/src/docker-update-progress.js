import {writeDurableJson,readDurableJson} from './durable-json.js';
import {seal,unseal} from './mfa.js';
export function createDockerUpdateProgress({now=Date.now,limit=200,ttl=86400000,file}={}){
 const entries=new Map(),valid=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(id);
 const key=(user,host,container,id)=>JSON.stringify([user,host,container,id]);
 const persist=()=>{if(file)writeDurableJson(file,{version:1,data:seal(JSON.stringify([...entries]))})};
 if(file){const saved=readDurableJson(file);if(saved){if(saved.version!==1)throw Error('Unsupported Docker operation journal');for(const [k,v] of JSON.parse(unseal(saved.data))){if(v.status==='running'){v.status='interrupted';v.stage='Controller restarted. Review and recover this attempt before retrying.'}entries.set(k,v)}persist()}}
 const locked=v=>['running','interrupted'].includes(v.status);
 const prune=()=>{for(const [k,v] of entries)if(now()-v.touched>ttl&&!locked(v))entries.delete(k)};
 const find=(user,host,container,id)=>valid(id)?entries.get(key(user,host,container,id)):null;
 const tracking=entry=>({
  report(percent,stage){if(entry.status!=='running')return;entry.percent=Math.max(entry.percent,Math.min(99,percent));entry.stage=stage;entry.touched=now();persist()},
  checkpoint(value){entry.checkpoint=structuredClone(value);entry.touched=now();persist()},
  finish(result){if(result)entry.result=structuredClone(result);entry.percent=100;entry.stage='Update installed and verified';entry.status='completed';entry.touched=now();delete entry.checkpoint;persist()},
  fail(message){if(message)entry.error=String(message).slice(0,1000);entry.status='failed';entry.stage='Installation failed. Review the result below before retrying.';entry.touched=now();delete entry.checkpoint;persist()},
 });
 return {
  start(user,host,container,id){if(!valid(id))throw Object.assign(Error('Invalid installation progress identifier.'),{status:400});prune();if(entries.size>=limit){const oldest=[...entries].find(([,v])=>!locked(v));if(oldest)entries.delete(oldest[0]);else throw Object.assign(Error('Too many installations are being tracked. Retry shortly.'),{status:429})}if([...entries.values()].some(v=>locked(v)&&v.host===host&&v.container===container))throw Object.assign(Error('An update is already running or interrupted for this container. Recover the earlier attempt first.'),{status:409});const entry={percent:0,stage:'Checking reviewed configuration',status:'running',startedAt:new Date(now()).toISOString(),touched:now(),host,container};entries.set(key(user,host,container,id),entry);persist();return tracking(entry)},
  read(user,host,container,id){prune();const entry=find(user,host,container,id);if(!entry)return {progress:null};const {touched,host:h,container:c,checkpoint,...progress}=entry;return {progress:{...progress,updatedAt:new Date(touched).toISOString()}}},
  interrupted(user,host,container,id){const entry=find(user,host,container,id);if(!entry||entry.status!=='interrupted')throw Object.assign(Error('This attempt is not awaiting recovery.'),{status:409});return {checkpoint:entry.checkpoint,tracking:tracking(entry)}},
 };
}
