import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {get,mutate} from './store.js';
import {connectorRelease,connectorSource} from './connector-release.js';
import {beginAutomaticConnectorUpdate,endConnectorUpdate} from './node-agents.js';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export function createAutomaticConnectorUpdates({persistence={get,mutate},release=connectorRelease,source=connectorSource,begin=beginAutomaticConnectorUpdate,end=endConnectorUpdate,now=Date.now,staggerMs=30000,timeoutMs=90000,maintenance=()=>!!process.env.DATA_DIR&&fs.existsSync(path.join(process.env.DATA_DIR,'maintenance.json'))}={}){
 let active=null;
 const registered=id=>(persistence.get().nodeAgents||[]).find(n=>n.id===id)||(()=>{throw fail('Paired connector not found',404)})();
 const rows=()=>persistence.get().automaticConnectorUpdates||{};
 const save=(id,patch)=>persistence.mutate(s=>{s.automaticConnectorUpdates??={};s.automaticConnectorUpdates[id]={...s.automaticConnectorUpdates[id],...patch}});
 const releaseLock=()=>{if(active){end(active.id);active=null}};
 function expire(){if(active&&!(persistence.get().nodeAgents||[]).some(n=>n.id===active.id)){save(active.id,{state:'cancelled',message:'Pairing revoked; automatic update tracking cancelled.'});releaseLock();}if(active&&now()-active.started>=timeoutMs){save(active.id,{state:'unverified',message:'Update heartbeat was not verified. Automatic rollout paused; inspect this connector before retrying.'});releaseLock()}}
 function status(id){registered(id);expire();return {enabled:false,...rows()[id],requiredVersion:9,...release}}
 return {status,configure(id,input,actor){registered(id);if(typeof input?.enabled!=='boolean'||(input.enabled||input.retry===true)&&input.confirm!==true)throw fail('Explicit approval is required to enable automatic updates');const prior=rows()[id];save(id,{enabled:input.enabled,approvedBy:actor.sub,approvedAt:new Date(now()).toISOString(),...(input.retry===true&&['failed','unverified'].includes(prior?.state)?{state:'waiting',message:'Retry authorized.'}:{})});return status(id)},
 poll(agent,input,result){expire();const setting=rows()[agent.id];const verified=setting?.state==='completed'&&input.revision===setting.targetRevision?{connectorUpdateVerified:setting.nonce}:{};
  if(active?.id===agent.id&&input.connectorUpdateError){save(agent.id,{state:'failed',message:'Connector rejected or could not install its automatic update. Previous connector retained; rollout paused.'});releaseLock();return {}}
  if(setting&&['offered','verifying','unverified','waiting'].includes(setting.state)&&input.version===setting.targetVersion&&input.revision===setting.targetRevision){
   if(input.connectorUpdateReceipt===setting.nonce){save(agent.id,{state:'completed',message:'Automatic update verified by a fresh paired heartbeat and durable local receipt.',completedAt:new Date(now()).toISOString()});if(active?.id===agent.id)releaseLock();}
   else if(setting.state!=='verifying')save(agent.id,{state:'verifying',message:'Fresh heartbeat received; waiting for the connector to persist rollback verification.'});
   return {connectorUpdateVerified:setting.nonce};
  }
  if(!active&&setting?.state==='offered'){save(agent.id,{state:'unverified',message:'Controller restarted during update tracking. Inspect the heartbeat before authorizing a retry.'});return {}}
  if(active||maintenance()||!setting?.enabled||(!Number.isInteger(input.version)||input.version<9)||input.version>release.version||input.revision===release.revision||input.updateReady!==true||result.jobs.length||!/^([a-f0-9]{32})$/.test(input.updateNonce||''))return verified;
  const values=Object.entries(rows()).filter(([id])=>(persistence.get().nodeAgents||[]).some(n=>n.id===id)).map(([,row])=>row);if(values.some(j=>['failed','unverified','offered','verifying'].includes(j.state)&&j.targetRevision===release.revision)||values.some(j=>j.completedAt&&now()-Date.parse(j.completedAt)<staggerMs))return verified;
  try{begin(agent.id)}catch{return {}};
  const payload={id:agent.id,version:release.version,revision:release.revision,expiresAt:now()+30000,nonce:input.updateNonce};
  payload.signature=crypto.createHmac('sha256',Buffer.from(agent.tokenHash,'hex')).update(JSON.stringify([payload.id,payload.version,payload.revision,payload.expiresAt,payload.nonce])).digest('hex');
  try{save(agent.id,{state:'offered',message:'Connector idle; authenticated update offered. Waiting for a fresh heartbeat.',targetVersion:release.version,targetRevision:release.revision,nonce:payload.nonce,startedAt:new Date(now()).toISOString()});active={id:agent.id,started:now()};return {...verified,connectorUpdate:{...payload,source:Buffer.from(source).toString('base64')}}}catch(error){end(agent.id);throw error}
 },};
}
export const automaticConnectorUpdates=createAutomaticConnectorUpdates();
