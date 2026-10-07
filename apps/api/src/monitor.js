import crypto from 'node:crypto';
import { get,mutate } from './store.js';
import { proxmoxConfigured,proxmoxSnapshot,dockerConfigured,dockerSnapshot } from './connectors.js';
import { truenasConfigured,truenasSnapshot,opnsenseConfigured,opnsenseSnapshot,tailscaleConfigured,tailscaleSnapshot,extraServices } from './infrastructure.js';

export const providers={
  proxmox:{configured:proxmoxConfigured,read:proxmoxSnapshot},docker:{configured:dockerConfigured,read:dockerSnapshot},
  truenas:{configured:truenasConfigured,read:truenasSnapshot},opnsense:{configured:opnsenseConfigured,read:opnsenseSnapshot},tailscale:{configured:tailscaleConfigured,read:tailscaleSnapshot}
};
export function alertConditions(snapshot,rules){
  const conditions=[];
  for(const service of snapshot.services)if(['error','partial'].includes(service.status))conditions.push({key:`connection:${service.name}`,title:service.status==='partial'?'Incomplete monitoring':'Connection failed',source:service.name,provider:service.provider,severity:service.status==='partial'?'warning':'critical',details:service.error});
  const resources=[...(snapshot.proxmox?.nodes||[]).map(n=>({...n,provider:'proxmox'})),...(snapshot.docker?.containers||[]).map(c=>({...c,provider:'docker',memory:c.memoryPercent})),...(snapshot.proxmox?.storage||[]).map(p=>({...p,provider:'proxmox',storage:p.usage})),...(snapshot.truenas?.pools||[]).map(p=>({...p,provider:'truenas',storage:p.usage}))];
  for(const rule of rules.filter(r=>r.enabled!==false))for(const resource of resources){
    if(rule.provider!=='all'&&rule.provider!==resource.provider)continue;
    const value=resource[rule.metric];
    if(typeof value==='number'&&value>=rule.threshold)conditions.push({key:`rule:${rule.id}:${resource.provider}:${resource.id}`,title:rule.name,source:resource.name,provider:resource.provider,severity:rule.severity,details:`${rule.metric}: ${value}% (threshold ${rule.threshold}%)`});
  }
  for(const a of snapshot.truenas?.alerts||[])if(!a.dismissed)conditions.push({key:`truenas:${a.id||a.uuid}`,title:a.klass||'TrueNAS alert',source:'TrueNAS',provider:'truenas',severity:['CRITICAL','ALERT','EMERGENCY'].includes(a.level)?'critical':'warning',details:a.formatted||a.text||JSON.stringify(a.args)});
  return conditions;
}
export function createMonitor(sources=providers,persistence={get,mutate},checkServices=extraServices){
  let latest=null,inFlight=null;
  async function sample(force=false){
    if(inFlight)return inFlight;
    if(!force&&latest&&Date.now()-Date.parse(latest.sampledAt)<10000)return latest;
    inFlight=(async()=>{
      const snapshot={sampledAt:new Date().toISOString(),services:[],hosts:[]};
      await Promise.all(Object.entries(sources).map(async([name,source])=>{
        if(!source.configured()){snapshot.services.push({name,provider:name,status:'not-configured',response:null});return;}
        const started=Date.now();
        try{snapshot[name]=await source.read();const errors=snapshot[name].errors||[];snapshot.services.push({name,provider:name,status:errors.length?'partial':'reachable',response:Date.now()-started,...(errors.length?{error:errors.join('; ')}:{})});}
        catch(error){snapshot.services.push({name,provider:name,status:'error',response:Date.now()-started,error:error.message});}
      }));
      try{snapshot.services.push(...await checkServices());}catch(e){snapshot.services.push({name:'Additional service configuration',status:'error',error:e.message});}
      snapshot.hosts=[...(snapshot.proxmox?.nodes||[]).map(n=>({name:n.name,status:n.status})),...(snapshot.docker?[{name:snapshot.docker.host.hostname,status:'reachable'}]:[]),...(snapshot.truenas?[{name:snapshot.truenas.info.hostname,status:'reachable'}]:[])];
      const measured=snapshot.proxmox?.nodes?.filter(n=>n.status==='online')||[];
      const mean=key=>{const values=measured.map(n=>n[key]).filter(v=>typeof v==='number');return values.length?Math.round(values.reduce((sum,v)=>sum+v,0)/values.length):null;};
      persistence.mutate(state=>{
        state.metrics.push({time:snapshot.sampledAt,cpu:mean('cpu'),memory:mean('memory')});state.metrics=state.metrics.slice(-2880);
        const conditions=alertConditions(snapshot,state.rules),activeKeys=new Set(conditions.map(c=>c.key));
        for(const existing of state.alerts)if(existing.status!=='resolved'&&!activeKeys.has(existing.key)){
          const service=snapshot.services.find(s=>s.provider===existing.provider);
          if(service?.status==='reachable'){existing.status='resolved';existing.resolvedAt=snapshot.sampledAt;}
        }
        for(const condition of conditions){const current=state.alerts.find(a=>a.key===condition.key&&a.status!=='resolved');
          if(current){current.details=condition.details;current.lastSeen=snapshot.sampledAt;}else state.alerts.unshift({...condition,id:crypto.randomUUID(),status:'active',triggered:snapshot.sampledAt,lastSeen:snapshot.sampledAt});
        }
        state.alerts=state.alerts.slice(0,1000);
      });
      snapshot.metrics=persistence.get().metrics;
      snapshot.alerts=persistence.get().alerts;
      latest=snapshot;return snapshot;
    })().finally(()=>{inFlight=null;});
    return inFlight;
  }
  return {sample,invalidate:async()=>{latest=null;if(inFlight){await inFlight.catch(()=>{});latest=null;}}};
}
export const monitor=createMonitor();
