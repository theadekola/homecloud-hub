import fs from 'node:fs';
import path from 'node:path';
// One-time compatibility cleanup. These names are not supported adapters.
const retired=['opnsense','tailscale'];
const obsolete=value=>retired.some(p=>String(value||'').toLowerCase().includes(p))||String(value||'').startsWith('/vpn');
export function retireProviders(state){
 const removed=new Set((state.alerts||[]).filter(a=>obsolete(a.provider)||obsolete(a.key)||obsolete(a.source)).map(a=>a.id));
 for(const key of ['alerts','rules'])if(state[key])state[key]=state[key].filter(row=>!obsolete(row.provider)&&!obsolete(row.key)&&!obsolete(row.source));
 if(state.notificationQueue)state.notificationQueue=state.notificationQueue.filter(row=>!removed.has(row.alertId));
 if(state.headerActivities)state.headerActivities=state.headerActivities.filter(row=>!obsolete(row.category)&&!obsolete(row.link)&&!obsolete(row.title));
 if(state.headerObservations)state.headerObservations=Object.fromEntries(Object.entries(state.headerObservations).filter(([key])=>!obsolete(key)&&![...removed].some(id=>key==='alert:'+id)));
 for(const metric of state.metrics||[])for(const key of retired)delete metric[key];
 return state;
}
export function removeRetiredConfigurations(directory){for(const provider of retired)for(const suffix of ['.json','.json.tmp'])fs.rmSync(path.join(directory,provider+suffix),{force:true});}
