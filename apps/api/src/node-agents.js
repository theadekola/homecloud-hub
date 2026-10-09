import crypto from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {get,mutate} from './store.js';
const contexts=new AsyncLocalStorage(),pairings=new Map(),nodes=new Map(),jobs=new Map();
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(m,status=400)=>{throw Object.assign(new Error(m),{status})};
export const agentContext=contexts;
export function selectedAgentHost(){return contexts.getStore()?.host||'';}
export function createPairing(){const code=crypto.randomBytes(24).toString('hex');pairings.set(hash(code),Date.now()+600000);return {code,expiresAt:new Date(Date.now()+600000).toISOString()};}
export function pairNode(code,name){const digest=hash(String(code)),expires=pairings.get(digest);if(!expires||expires<Date.now())fail('Pairing code expired or invalid',401);if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(name))fail('Invalid node name');pairings.delete(digest);const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');mutate(s=>{s.nodeAgents??=[];s.nodeAgents.push({id,name,tokenHash:hash(token)});});return {id,token};}
export function authenticateAgent(token){const digest=hash(String(token||''));return (get().nodeAgents||[]).find(n=>n.tokenHash===digest)||fail('Agent authentication rejected',401);}
export function agentNodes(){return (get().nodeAgents||[]).map(({id,name})=>({id,name,lastSeen:nodes.get(id)?.lastSeen||null,hosts:nodes.get(id)?.hosts||[],online:Date.now()-(nodes.get(id)?.time||0)<90000}));}
export function agentHosts(){return agentNodes().flatMap(n=>n.hosts.map(h=>({...h,id:`${n.id}:${h.id}`,agent:n.id,node:n.name,online:n.online&&h.online})));}
export function revokeAgent(id){mutate(s=>{s.nodeAgents=(s.nodeAgents||[]).filter(n=>n.id!==id)});nodes.delete(id);for(const [key,j]of jobs)if(j.agent===id){j.reject(new Error('Node agent revoked'));jobs.delete(key)}}
export function pollAgent(agent,input){
 if(!Array.isArray(input.hosts)||input.hosts.length>500)fail('Invalid host report');
 const hosts=input.hosts.map(h=>{if(!/^(node|qemu\/\d+|lxc\/\d+)$/.test(h.id))fail('Invalid guest identity');return {id:h.id,name:String(h.name||h.id).slice(0,100),online:h.online===true,error:String(h.error||'').slice(0,400)}});
 nodes.set(agent.id,{time:Date.now(),lastSeen:new Date().toISOString(),hosts});
 for(const r of (input.results||[]).slice(0,20)){const j=jobs.get(r.id);if(!j||j.agent!==agent.id)continue;jobs.delete(r.id);if(r.error)j.reject(new Error(String(r.error).slice(0,400)));else if(typeof r.body==='string'&&r.body.length<=2500000&&Number.isInteger(r.status))j.resolve(r);else j.reject(new Error('Invalid agent response'));}
 const pending=[];for(const [id,j]of jobs)if(j.agent===agent.id&&!j.sent){j.sent=true;pending.push({id,host:j.host,path:j.path,method:j.method,body:j.body});if(pending.length===5)break}return {jobs:pending};
}
export async function agentRequest(path,init={}){
 const identity=selectedAgentHost(),host=agentHosts().find(h=>h.id===identity);if(!host?.online)fail('Selected Docker host is offline or unavailable',503);
 if(!/^\/(info|version|containers|images|networks|volumes|system|events|build)([/?]|$)/.test(path)||/[\r\n]/.test(path)||path.length>4096)fail('Unsupported Docker request');
 const method=init.method||'GET';if(!['GET','POST','DELETE'].includes(method))fail('Unsupported method');
 const body=init.body==null?'':(Buffer.isBuffer(init.body)?init.body:Buffer.from(String(init.body),'utf8')).toString('base64');if(body.length>1500000)fail('Request exceeds agent size limit');
 const result=await new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timeout=setTimeout(()=>{jobs.delete(id);reject(new Error('Node agent request timed out'))},330000);jobs.set(id,{agent:host.agent,host:host.id.slice(host.agent.length+1),path,method,body,sent:false,resolve:r=>{clearTimeout(timeout);resolve(r)},reject:e=>{clearTimeout(timeout);reject(e)}})});
 const buffer=Buffer.from(result.body,'base64');return {ok:result.status>=200&&result.status<300,status:result.status,buffer,text:async()=>buffer.toString('utf8'),json:async()=>JSON.parse(buffer.toString('utf8'))};
}
