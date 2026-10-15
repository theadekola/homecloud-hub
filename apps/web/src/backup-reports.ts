import {distinctBackupPoints} from './backup-selection';
export function backupOutcome(task:any){
 const state=String(task.exitstatus||task.status||'');
 if(state==='OK')return 'Successful';
 if(state.toLowerCase()==='running')return 'Running';
 if(Number.isFinite(task.endtime))return state&&state.toLowerCase()!=='stopped'?'Failed':'Unknown';
 return state?'Unknown':'Running';
}
export function backupDuration(task:any){return Number.isFinite(task.starttime)&&task.starttime>0&&Number.isFinite(task.endtime)&&task.endtime>=task.starttime?task.endtime-task.starttime:null;}
export function backupSummary(tasks:any[]){const success=tasks.filter(t=>backupOutcome(t)==='Successful').length,failed=tasks.filter(t=>backupOutcome(t)==='Failed').length,durations=tasks.map(backupDuration).filter((v:any)=>v!==null) as number[];return {total:tasks.length,success,failed,running:tasks.filter(t=>backupOutcome(t)==='Running').length,unknown:tasks.filter(t=>backupOutcome(t)==='Unknown').length,rate:success+failed?success/(success+failed)*100:null,average:durations.length?durations.reduce((n,v)=>n+v,0)/durations.length:null};}
export function backupActivity(tasks:any[]){const days=new Map<string,any>();for(const t of [...tasks].sort((a,b)=>a.starttime-b.starttime)){if(!Number.isFinite(t.starttime))continue;const d=new Date(t.starttime*1000),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const row=days.get(key)||{day:key,Successful:0,Failed:0,Running:0,Unknown:0,seconds:0,measured:0,average:null};row[backupOutcome(t)]++;const duration=backupDuration(t);if(duration!==null){row.seconds+=duration;row.measured++;row.average=row.seconds/row.measured}days.set(key,row)}return [...days.values()];}
export function reportCsv(table:any[][]){const cell=(value:any)=>{let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};return table.map(row=>row.map(cell).join(',')).join('\r\n');}
export function backupCsv(tasks:any[]){return reportCsv([['Started','Node','Guest','Outcome','Provider status','Duration seconds','Task ID'],...tasks.map(t=>[Number.isFinite(t.starttime)&&t.starttime>0?new Date(t.starttime*1000).toISOString():'',t.node,t.id,backupOutcome(t),t.exitstatus||t.status||'',backupDuration(t)??'',t.upid])]);}

export function distinctReportTasks(tasks:any[]){
 const seen=new Set<string>();return tasks.filter(task=>{if(!task.upid)return true;const key=JSON.stringify([task.node,task.upid]);if(seen.has(key))return false;seen.add(key);return true});
}
export function archiveTime(point:any){
 const value=point.created;if(value===null||value===undefined||value==='')return null;
 const time=typeof value==='number'||typeof value==='string'&&/^\d+(\.\d+)?$/.test(value)?Number(value)*1000:Date.parse(value);
 return Number.isFinite(time)&&time>0?time:null;
}
export function reportArchives(points:any[],hours:number,node='all',now=Date.now()){
 const scoped=distinctBackupPoints(points.filter(point=>node==='all'||point.node===node));
 const items=scoped.filter(point=>{const time=archiveTime(point);return time!==null&&time>=now-hours*3600000&&time<=now});
 const measured=items.filter(point=>Number.isFinite(point.size)&&point.size>=0),days=new Map<string,{day:string;bytes:number;count:number}>();
 for(const point of measured){const time=new Date(archiveTime(point)!),day=`${time.getFullYear()}-${String(time.getMonth()+1).padStart(2,'0')}-${String(time.getDate()).padStart(2,'0')}`,entry=days.get(day)||{day,bytes:0,count:0};entry.bytes+=point.size;entry.count++;days.set(day,entry)}
 return {items,measured,bytes:measured.reduce((sum,point)=>sum+point.size,0),unknownSize:items.length-measured.length,unknownDate:scoped.filter(point=>archiveTime(point)===null).length,activity:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day))};
}
export function reportTaskType(task:any,points:any[]){
 if(!task.node||!/^\d+$/.test(String(task.id||'')))return 'Unreported';
 const types=new Set(points.filter(point=>point.node===task.node&&String(point.vmid)===String(task.id)).map(point=>point.type));
 return types.size===1&&types.has('qemu')?'VM':types.size===1&&types.has('lxc')?'LXC':'Unreported';
}
