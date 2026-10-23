import crypto from 'node:crypto';
const fail=message=>{throw Object.assign(new Error(message),{status:400})};
export function cleanupRange(input){
 const date=key=>{const value=input?.[key];if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail(`Invalid ${key} date`);return value};
 const from=date('from'),to=date('to');if(from>to)fail('From date must not be after To date');return {from,to};
}
export function matchingHistory(alert,range){const time=Date.parse(alert.triggered);return alert.status==='resolved'&&Number.isFinite(time)&&time>=Date.parse(range.from)&&time<=Date.parse(range.to)}
export function createHistoryCleanup(persistence,now=Date.now){
 const preview=input=>{const range=cleanupRange(input);return {...range,count:(persistence.get().alerts||[]).filter(a=>matchingHistory(a,range)).length}};
 const clear=(state,range)=>{const before=state.alerts.length;state.alerts=state.alerts.filter(a=>!matchingHistory(a,range));return before-state.alerts.length};
 return {preview,list:()=>persistence.get().alertHistoryCleanups||[],clear(input){const range=cleanupRange(input);let removed=0;persistence.mutate(state=>{removed=clear(state,range)});return {removed,...range}},
 schedule(input,actor){const range=cleanupRange(input),runAt=input.runAt;if(typeof runAt!=='string'||!Number.isFinite(Date.parse(runAt))||Date.parse(runAt)<=now())fail('Choose a future cleanup time');if((persistence.get().alertHistoryCleanups||[]).filter(j=>j.status==='scheduled').length>=20)fail('At most 20 cleanups may be scheduled');const job={id:crypto.randomUUID(),...range,runAt:new Date(runAt).toISOString(),createdBy:actor.sub,createdAt:new Date(now()).toISOString(),status:'scheduled'};persistence.mutate(state=>{state.alertHistoryCleanups=[...(state.alertHistoryCleanups||[]).filter(j=>j.status==='scheduled'),...(state.alertHistoryCleanups||[]).filter(j=>j.status!=='scheduled').slice(-19),job]});return job},
 cancel(id){let found=false;persistence.mutate(state=>{const job=state.alertHistoryCleanups?.find(j=>j.id===id&&j.status==='scheduled');if(job){job.status='cancelled';found=true}});if(!found)throw Object.assign(new Error('Scheduled cleanup not found'),{status:404});return {cancelled:true}},
 runDue(){const due=(persistence.get().alertHistoryCleanups||[]).some(j=>j.status==='scheduled'&&Date.parse(j.runAt)<=now());if(!due)return [];const results=[];persistence.mutate(state=>{for(const job of state.alertHistoryCleanups||[])if(job.status==='scheduled'&&Date.parse(job.runAt)<=now()){const range=cleanupRange(job);job.removed=clear(state,range);job.status='completed';job.completedAt=new Date(now()).toISOString();results.push({...job})}});return results},
 };
}
