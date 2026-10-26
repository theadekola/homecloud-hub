// Retire only alerts produced by the removed i-Clusters temperature monitor.
// Do not mark them recovered: no physical health assessment was performed.
export function retireTemperature(state){
 const obsolete=key=>typeof key==='string'&&/^operations:.+:(?:temperature|sensor-fault):/.test(key);
 const removed=new Set((state.alerts||[]).filter(a=>obsolete(a.key)).map(a=>a.id));
 if(state.alerts)state.alerts=state.alerts.filter(a=>!obsolete(a.key));
 if(state.notificationQueue)state.notificationQueue=state.notificationQueue.filter(row=>!removed.has(row.alertId)&&!obsolete(row.alert?.key));
 if(state.headerObservations)for(const id of removed)delete state.headerObservations['alert:'+id];
 if(state.headerActivities)state.headerActivities=state.headerActivities.filter(row=>!removed.has(row.link?.match(/^\/alerts\?alert=([^&]+)/)?.[1])&&!/^(?:Recovered: |Manually resolved: )?(?:High hardware temperature|Temperature sensor fault)$/.test(row.title||''));
 return state;
}
