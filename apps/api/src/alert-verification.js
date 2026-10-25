// Unresolved is a lifecycle state, not proof that the last observation is current.
export function alertVerification(alert,state,now=Date.now()){
 const recent=(date,maximum)=>{const at=Date.parse(date);return Number.isFinite(at)&&at<=now+60000&&now-at<=maximum};
 if(alert.key?.startsWith('docker-image:'))return (state.dockerImageUpdates?.rows||[]).some(row=>row.hostId===alert.updateHost&&row.containerId===alert.updateContainer&&row.status==='available'&&row.remoteDigest&&alert.key.endsWith(':'+row.remoteDigest)&&recent(row.checkedAt,86400000))?'confirmed':'unverified';
 return recent(alert.lastSeen,180000)?'confirmed':'unverified';
}
