export function backupOutcome(task:any){
 const state=String(task.exitstatus||task.status||'');
 if(state==='OK')return 'Successful';
 if(state.toLowerCase()==='running')return 'Running';
 if(Number.isFinite(task.endtime))return state&&state.toLowerCase()!=='stopped'?'Failed':'Unknown';
 return state?'Unknown':'Running';
}
export function backupDuration(task:any){return Number.isFinite(task.starttime)&&Number.isFinite(task.endtime)&&task.endtime>=task.starttime?task.endtime-task.starttime:null;}
export function backupSummary(tasks:any[]){const success=tasks.filter(t=>backupOutcome(t)==='Successful').length,failed=tasks.filter(t=>backupOutcome(t)==='Failed').length,durations=tasks.map(backupDuration).filter((v:any)=>v!==null) as number[];return {total:tasks.length,success,failed,running:tasks.filter(t=>backupOutcome(t)==='Running').length,unknown:tasks.filter(t=>backupOutcome(t)==='Unknown').length,rate:success+failed?success/(success+failed)*100:null,average:durations.length?durations.reduce((n,v)=>n+v,0)/durations.length:null};}
export function backupActivity(tasks:any[]){const days=new Map<string,any>();for(const t of [...tasks].sort((a,b)=>a.starttime-b.starttime)){if(!Number.isFinite(t.starttime))continue;const d=new Date(t.starttime*1000),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const row=days.get(key)||{day:key,Successful:0,Failed:0,Running:0,Unknown:0,seconds:0,measured:0,average:null};row[backupOutcome(t)]++;const duration=backupDuration(t);if(duration!==null){row.seconds+=duration;row.measured++;row.average=row.seconds/row.measured}days.set(key,row)}return [...days.values()];}
export function backupCsv(tasks:any[]){const cell=(value:any)=>{let text=String(value??'');if(/^[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};return [['Started','Node','Guest','Outcome','Provider status','Duration seconds','Task ID'],...tasks.map(t=>[Number.isFinite(t.starttime)?new Date(t.starttime*1000).toISOString():'',t.node,t.id,backupOutcome(t),t.exitstatus||t.status||'',backupDuration(t)??'',t.upid])].map(row=>row.map(cell).join(',')).join('\r\n');}
