import {connectorUpdateInfo} from './connector-release.js';
import crypto from 'node:crypto';
import {acceptNetworkReport} from './network-telemetry.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import {get,mutate} from './store.js';
const contexts=new AsyncLocalStorage(),pairings=new Map(),nodes=new Map(),jobs=new Map();
const updating=new Set();
export function beginConnectorUpdate(id){if(updating.has(id)||[...jobs.values()].some(j=>j.agent===id&&(j.operation==='setup'||j.method!=='GET')))fail('Wait for connector management actions to finish before updating',409);updating.add(id);}
export function endConnectorUpdate(id){updating.delete(id);}
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(m,status=400)=>{throw Object.assign(new Error(m),{status})};
export const agentContext=contexts;
export function selectedAgentHost(){return contexts.getStore()?.host||'';}
export function createPairing({kind='proxmox',name=''}={}){for(const [key,p] of pairings)if(p.expires<Date.now())pairings.delete(key);if(!['proxmox','docker'].includes(kind))fail('Invalid connection type');if(typeof name!=='string'||(name&&(!name.trim()||!/^[a-zA-Z0-9 _.()-]{1,100}$/.test(name))))fail('Invalid connection name');const code=crypto.randomBytes(24).toString('hex'),expires=Date.now()+600000;pairings.set(hash(code),{expires,kind,name:name.trim()});return {code,kind,expiresAt:new Date(expires).toISOString()};}
export function pairNode(code,name,kind='proxmox'){const digest=hash(String(code)),pairing=pairings.get(digest);if(!pairing||pairing.id||pairing.expires<Date.now())fail('Pairing code expired or invalid',401);if(kind!==pairing.kind)fail('Pairing code is for a different connection type',401);if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(name))fail('Invalid node name');const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');mutate(s=>{s.nodeAgents??=[];s.nodeAgents.push({id,name:pairing.name||name,hostname:name,kind,tokenHash:hash(token)});});pairing.id=id;return {id,token,kind};}
export function pairingStatus(code){const pairing=pairings.get(hash(String(code)));if(!pairing||pairing.expires<Date.now())fail('Pairing code expired or invalid',401);return {paired:!!pairing.id,id:pairing.id||null,kind:pairing.kind};}
export function authenticateAgent(token){const digest=hash(String(token||''));return (get().nodeAgents||[]).find(n=>n.tokenHash===digest)||fail('Agent authentication rejected',401);}
export function agentNodes(){return (get().nodeAgents||[]).map(({id,name,hostname=name,kind='proxmox'})=>{const report=nodes.get(id),node={id,name,hostname,kind,lastSeen:report?.lastSeen||null,hosts:report?.hosts||[],version:report?.version||1,revision:report?.revision||null,online:Date.now()-(report?.time||0)<90000};return {...node,update:connectorUpdateInfo(node)};});}
export function agentNetworkReports(){return agentNodes().map(n=>({id:n.id,hostname:n.hostname,kind:n.kind,online:n.online,version:n.version,network:nodes.get(n.id)?.network||null}));}
export function agentHosts(){return agentNodes().flatMap(n=>n.hosts.map(h=>({...h,id:`${n.id}:${h.id}`,agent:n.id,node:n.name,kind:n.kind,online:n.online&&h.online})));}
export function revokeAgent(id){mutate(s=>{s.nodeAgents=(s.nodeAgents||[]).filter(n=>n.id!==id)});nodes.delete(id);for(const [key,j]of jobs)if(j.agent===id){j.reject(new Error('Node agent revoked'));jobs.delete(key)}}
export function pollAgent(agent,input){
 if(!Array.isArray(input.hosts)||input.hosts.length>500)fail('Invalid host report');
 const hosts=input.hosts.map(h=>{if((agent.kind==='docker'&&h.id!=='node')||!/^(node|qemu\/\d+|lxc\/\d+)$/.test(h.id))fail('Invalid guest identity');return {id:h.id,name:String(h.name||h.id).slice(0,100),online:h.online===true,error:String(h.error||'').slice(0,400),setup:h.setup===true,status:String(h.status||'unavailable').slice(0,40)}});
 nodes.set(agent.id,{version:Number.isInteger(input.version)&&input.version>0&&input.version<=1000?input.version:1,revision:/^[a-f0-9]{64}$/.test(input.revision||'')?input.revision:null,time:Date.now(),lastSeen:new Date().toISOString(),hosts,network:input.network?acceptNetworkReport(nodes.get(agent.id)?.network,input.network):null});
 for(const p of (Array.isArray(input.progress)?input.progress:[]).slice(0,20)){const j=jobs.get(p?.id);if(!j||j.agent!==agent.id||!j.onProgress)continue;for(const e of (Array.isArray(p.events)?p.events:[]).slice(0,256))j.onProgress(e);}
 for(const r of (input.results||[]).slice(0,20)){const j=jobs.get(r.id);if(!j||j.agent!==agent.id)continue;jobs.delete(r.id);if(r.error)j.reject(new Error(String(r.error).slice(0,400)));else if(typeof r.body==='string'&&r.body.length<=2500000&&Number.isInteger(r.status))j.resolve(r);else j.reject(new Error('Invalid agent response'));}
 const pending=[];for(const [id,j]of jobs)if(j.agent===agent.id&&!j.sent){j.sent=true;pending.push({id,host:j.host,path:j.path,method:j.method,body:j.body,operation:j.operation||'docker',expiresAt:j.expiresAt,...(j.onProgress?{progress:true}:{})});if(pending.length===5)break}return {jobs:pending};
}
export function selectedAgentVersion(){const host=agentHosts().find(h=>h.id===selectedAgentHost());return agentNodes().find(n=>n.id===host?.agent)?.version||0;}
function queueAgentRead(host,payload,duration){return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timeout=setTimeout(()=>{jobs.delete(id);reject(new Error('Node agent request timed out'))},duration);jobs.set(id,{agent:host.agent,host:host.id.slice(host.agent.length+1),...payload,expiresAt:Date.now()+duration,sent:false,resolve:r=>{clearTimeout(timeout);resolve(r)},reject:e=>{clearTimeout(timeout);reject(e)}})});}
export async function agentContainerStats(ids,{timeoutMs=15000}={}){
 const host=agentHosts().find(h=>h.id===selectedAgentHost());if(!host?.online)fail('Selected Docker host is offline or unavailable',503);
 if(selectedAgentVersion()<5)fail('Update the paired connector to version 5 for batched statistics',409);
 if(!Array.isArray(ids)||!ids.length||ids.length>16||ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(id)))fail('Invalid container statistics request');
 const body=Buffer.from(JSON.stringify(ids)).toString('base64'),duration=Math.max(1000,Math.min(timeoutMs,30000));
 const result=await queueAgentRead(host,{operation:'stats',path:'',method:'GET',body},duration);
 if(result.status!==200)fail('Connector statistics collection failed',502);
 const data=JSON.parse(Buffer.from(result.body,'base64').toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))fail('Invalid connector statistics response',502);return data;
}
export async function agentRequest(path,init={}){
 const identity=selectedAgentHost(),host=agentHosts().find(h=>h.id===identity);if(!host?.online)fail('Selected Docker host is offline or unavailable',503);
 if(!/^\/(info|version|containers|images|networks|volumes|system|events|build|distribution)([/?]|$)/.test(path)||/[\r\n]/.test(path)||path.length>4096)fail('Unsupported Docker request');
 const method=init.method||'GET';if(method!=='GET'&&updating.has(host.agent))fail('Connector update is in progress. Retry management actions after verification.',409);if(!['GET','POST','DELETE'].includes(method))fail('Unsupported method');
 const body=init.body==null?'':(Buffer.isBuffer(init.body)?init.body:Buffer.from(String(init.body),'utf8')).toString('base64');if(body.length>1500000)fail('Request exceeds agent size limit');
 const livePull=method==='POST'&&path.startsWith('/images/create?')&&typeof init.onProgress==='function'&&selectedAgentVersion()>=6;
 const duration=Math.max(1000,Math.min((Number(init.timeoutMs)||(method==='GET'?15000:330000))+(livePull?30000:0),livePull?930000:330000));
 const result=await queueAgentRead(host,{path,method,body,...(livePull?{onProgress:init.onProgress}:{})},duration);
 const buffer=Buffer.from(result.body,'base64');return {ok:result.status>=200&&result.status<300,status:result.status,buffer,text:async()=>buffer.toString('utf8'),json:async()=>JSON.parse(buffer.toString('utf8'))};
}

export async function installAgentHost(identity){
 const host=agentHosts().find(h=>h.id===identity),node=agentNodes().find(n=>n.id===host?.agent);
 if(!node?.online)fail('Node agent is offline',503);
 if(updating.has(node.id))fail('Connector update is in progress',409);
 if(node.version<2)fail('Update the installed node agent before using guest setup',409);
 if(!host.setup||host.id.endsWith(':node'))fail('Guest setup requires a reachable Debian/Ubuntu guest',400);
 if([...jobs.values()].some(j=>j.operation==='setup'&&j.agent===host.agent&&j.host===host.id.slice(host.agent.length+1)))fail('Setup is already running for this guest',409);
 const result=await new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timeout=setTimeout(()=>{jobs.delete(id);reject(new Error('Guest setup timed out; inspect the guest before retrying'))},960000);jobs.set(id,{agent:host.agent,host:host.id.slice(host.agent.length+1),operation:'setup',path:'',method:'POST',body:'',expiresAt:Date.now()+960000,sent:false,resolve:r=>{clearTimeout(timeout);resolve(r)},reject:e=>{clearTimeout(timeout);reject(e)}})});
 return JSON.parse(Buffer.from(result.body,'base64').toString('utf8'));
}
