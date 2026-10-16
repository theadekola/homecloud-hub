import {observeHeaderActivity} from './header-notifications.js';
import {notifier} from './notifications.js';
import {dockerFleet,monitoredDocker} from './docker-fleet.js';
import {agentContext} from './node-agents.js';
import crypto from 'node:crypto';
import { get,mutate } from './store.js';
import { proxmoxConfigured,proxmoxSnapshot,dockerConfigured,dockerSnapshot } from './connectors.js';
import { truenasConfigured,truenasSnapshot,extraServices } from './infrastructure.js';

export const providers={
  proxmox:{configured:proxmoxConfigured,read:proxmoxSnapshot},docker:{configured:dockerConfigured,read:dockerSnapshot},
  truenas:{configured:truenasConfigured,read:truenasSnapshot}
};
export function alertConditions(snapshot,rules){
  const conditions=[];
  for(const service of snapshot.services)if(['error','partial'].includes(service.status))conditions.push({key:`connection:${service.id||service.name}`,connectorId:service.id||service.provider,title:service.status==='partial'?'Incomplete monitoring':'Connection failed',source:service.name,provider:service.provider,severity:service.status==='partial'?'warning':'critical',details:service.error});
  const resources=[...(snapshot.proxmox?.nodes||[]).map(n=>({...n,provider:'proxmox'})),...monitoredDocker(snapshot).map(c=>({...c,id:c.monitorId,provider:'docker',memory:c.memoryPercent})),...(snapshot.proxmox?.storage||[]).map(p=>({...p,provider:'proxmox',storage:p.usage})),...(snapshot.truenas?.pools||[]).map(p=>({...p,provider:'truenas',storage:p.usage}))];
  for(const rule of rules.filter(r=>r.enabled!==false))for(const resource of resources){
    if(rule.provider!=='all'&&rule.provider!==resource.provider)continue;
    const value=resource[rule.metric];
    if(typeof value==='number'&&value>=rule.threshold)conditions.push({key:`rule:${rule.id}:${resource.provider}:${resource.id}`,ruleId:rule.id,title:rule.name,source:resource.host?`${resource.host} / ${resource.name}`:resource.name,connectorId:resource.connectorId,node:resource.node||(snapshot.proxmox?.nodes||[]).find(n=>n.id===resource.id)?.name,metric:rule.metric,resourceId:resource.id,provider:resource.provider,severity:rule.severity,details:`${rule.metric}: ${value}% (threshold ${rule.threshold}%)`});
  }
  for(const a of snapshot.truenas?.alerts||[])if(!a.dismissed)conditions.push({key:`truenas:${a.id||a.uuid}`,title:a.klass||'TrueNAS alert',source:'TrueNAS',provider:'truenas',severity:['CRITICAL','ALERT','EMERGENCY'].includes(a.level)?'critical':'warning',details:a.formatted||a.text||JSON.stringify(a.args)});
  return conditions;
}
export function createMonitor(sources=providers,persistence={get,mutate},checkServices=extraServices,fleet=async()=>({hosts:[]}),notify=async()=>{}){
 let latest=null,inFlight=null,progress=null,completed=0,generation=0;
 const readings=new Map();
 const empty=()=>({sampledAt:new Date().toISOString(),services:[],hosts:[],metrics:persistence.get().metrics,alerts:persistence.get().alerts});
 const hosts=s=>[...(s.proxmox?.nodes||[]).map(n=>({name:n.name,status:n.status,cpu:n.cpu,memoryPercent:n.memoryPercent,cores:n.cores,uptime:n.uptime})),...(s.docker?[{name:s.docker.host.hostname,status:'reachable'}]:[]),...(s.dockerFleet?.hosts||[]).map(h=>({id:h.id,name:`${h.node} / ${h.name}`,status:h.status})),...(s.truenas?[{name:s.truenas.info.hostname,status:'reachable'}]:[])];
 function collect(name,force=false){
  const prior=readings.get(name);
  if(prior?.pending)return prior.pending;
  if(!force&&prior?.result&&Date.now()-prior.time<10000)return Promise.resolve(prior.result);
  const ticket=generation,row={...prior},source=sources[name];
  const work=Promise.resolve().then(()=>agentContext.run({host:''},async()=>{
   const started=Date.now();let result;
   if(!source?.configured())result={service:{id:name,name,provider:name,status:'not-configured',response:null}};
   else try{const data=await source.read(),errors=data.errors||[];result={data,service:{id:name,name,provider:name,status:errors.length?'partial':'reachable',response:Date.now()-started,...(errors.length?{error:errors.join('; ')}:{})}};}
   catch(error){result={service:{id:name,name,provider:name,status:'error',response:Date.now()-started,error:error.message}};}
   if(ticket===generation&&readings.get(name)===row){row.result=result;row.time=Date.now();row.pending=null;}
   return result;
  }));row.pending=work;readings.set(name,row);return work;
 }
 async function sample(force=false){
  if(!force&&latest){if(!inFlight&&Date.now()-completed>=10000)void sample(true).catch(()=>{});return latest;}
  if(!inFlight){
   const ticket=generation,snapshot=empty();progress=snapshot;
   for(const [name,source] of Object.entries(sources))snapshot.services.push({id:name,name,provider:name,status:source.configured()?'pending':'not-configured',response:null});
   snapshot.services.push({id:'docker-fleet',name:'Docker host monitoring',provider:'docker',status:'pending',response:null});
   const work=agentContext.run({host:''},async()=>{
    await Promise.all([
     ...Object.keys(sources).map(async name=>{const result=await collect(name,true);if(result.data)snapshot[name]=result.data;snapshot.services=snapshot.services.map(s=>s.id===name?result.service:s);}),
     (async()=>{let services;try{snapshot.dockerFleet=await fleet();services=snapshot.dockerFleet.hosts.map(h=>({id:`docker:${h.id}`,name:`Docker ${h.node} / ${h.name}`,provider:'docker',hostId:h.id,status:h.status,response:h.response??null,error:h.error}));}catch{services=[{id:'docker-fleet',name:'Docker host monitoring',provider:'docker',status:'error',error:'Docker host inventory failed'}];}snapshot.services=[...snapshot.services.filter(s=>s.id!=='docker-fleet'),...services];})(),
     (async()=>{try{snapshot.services.push(...await checkServices());}catch(e){snapshot.services.push({name:'Additional service configuration',status:'error',error:e.message});}})()
    ]);
    snapshot.hosts=hosts(snapshot);
    if(ticket!==generation)return snapshot;
      const measured=snapshot.proxmox?.nodes?.filter(n=>n.status==='online')||[];
      const mean=key=>{const values=measured.map(n=>n[key]).filter(v=>typeof v==='number');return values.length?Math.round(values.reduce((sum,v)=>sum+v,0)/values.length):null;};
      persistence.mutate(state=>{
        state.metrics.push({time:snapshot.sampledAt,cpu:mean('cpu'),memory:mean('memory'),docker:monitoredDocker(snapshot).map(c=>({hostId:c.hostId,id:c.id,name:c.name,status:c.status,cpu:c.cpu,memory:c.memoryPercent,memoryBytes:c.memory})),nodes:measured.map(n=>({name:n.name,cpu:n.cpu,memory:n.memoryPercent})),storage:snapshot.proxmox?.storage||[]});state.metrics=state.metrics.slice(-2880);
        const conditions=alertConditions(snapshot,state.rules),activeKeys=new Set(conditions.map(c=>c.key));
        for(const existing of state.alerts)if(existing.status!=='resolved'&&!activeKeys.has(existing.key)){
          const service=snapshot.services.find(s=>existing.connectorId?(s.id||s.provider)===existing.connectorId:s.provider===existing.provider);
          if(service?.status==='reachable'){
            if(existing.metric){
              let row,value;
              if(existing.provider==='docker'){row=monitoredDocker(snapshot).find(c=>c.monitorId===existing.resourceId);value=existing.metric==='memory'?row?.memoryPercent:row?.cpu;}
              else if(existing.provider==='proxmox'){row=(existing.metric==='storage'?snapshot.proxmox?.storage:snapshot.proxmox?.nodes)?.find(r=>r.id===existing.resourceId);value=existing.metric==='storage'?row?.usage:row?.[existing.metric];}
              else if(existing.provider==='truenas'){row=snapshot.truenas?.pools?.find(r=>r.id===existing.resourceId);value=row?.usage;}
              const rule=state.rules.find(r=>r.id===(existing.ruleId||existing.key?.split(':')[1]));
              if(rule&&rule.enabled!==false&&(!row||!Number.isFinite(value)||(row.status!=null&&!['online','running','healthy','available'].includes(String(row.status).toLowerCase()))))continue;
            }existing.status='resolved';existing.resolvedAt=snapshot.sampledAt;}
        }
        for(const condition of conditions){const current=state.alerts.find(a=>a.key===condition.key&&a.status!=='resolved');
          if(current){current.ruleId=condition.ruleId||current.ruleId;current.node=condition.node;current.details=condition.details;current.lastSeen=snapshot.sampledAt;}else state.alerts.unshift({...condition,id:crypto.randomUUID(),status:'active',triggered:snapshot.sampledAt,lastSeen:snapshot.sampledAt});
        }
        state.alerts=state.alerts.slice(0,1000);
        observeHeaderActivity(state,snapshot);
      });
      snapshot.metrics=persistence.get().metrics;
      snapshot.alerts=persistence.get().alerts;
    latest=snapshot;completed=Date.now();Promise.resolve().then(()=>notify(snapshot.alerts)).catch(()=>{});return snapshot;
   });
   inFlight=work;void work.finally(()=>{if(inFlight===work){inFlight=null;progress=null;}}).catch(()=>{});
  }
  if(force)return inFlight;
  // First paint is bounded. Partial scans never resolve persisted alerts.
  let timer;const partial=progress,pending=inFlight;return Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve({...partial,hosts:hosts(partial),refreshing:true}),250);})]).finally(()=>clearTimeout(timer));
 }
 return {sample,isRefreshing:()=>!!inFlight,provider:async(name,{force=false}={})=>{
  if(force)return {...await collect(name,true),sampledAt:new Date().toISOString()};
  const cached=readings.get(name);if(cached?.result){if(!cached.pending&&Date.now()-cached.time>=10000)void collect(name,true);return {...cached.result,sampledAt:new Date(cached.time).toISOString()};}
  return {...await collect(name),sampledAt:new Date().toISOString()};
 },invalidate:async()=>{generation++;latest=null;progress=null;inFlight=null;readings.clear();}};
}
export const monitor=createMonitor(providers,{get,mutate},extraServices,dockerFleet,alerts=>notifier.deliver(alerts));
