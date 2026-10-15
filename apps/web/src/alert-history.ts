export const alertTime=(value:any)=>{const t=Date.parse(value);return Number.isFinite(t)?t:null};
export function historyBounds(days:string,from:string,to:string,now=Date.now()){
 const boundary=(value:string,end:boolean)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('Choose a valid date.');const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,end?23:0,end?59:0,end?59:0,end?999:0);if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d)throw Error('Choose a valid date.');return date.getTime()};
 const end=to?boundary(to,true):now,start=from?boundary(from,false):days==='all'?null:end-Number(days)*86400000;
 if(start!==null&&start>end)throw Error('The start date must be on or before the end date.');return {start,end:days==='all'&&!to?null:end};
}
export function alertDuration(alert:any){const start=alertTime(alert.triggered),end=alertTime(alert.resolvedAt);return start!==null&&end!==null&&end>=start?end-start:null;}
export function historyTimeline(rows:any[],bounds:{start:number|null;end:number|null}){
 const days=new Map<string,any>();const row=(t:number)=>{const d=new Date(t),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(!days.has(key))days.set(key,{day:key,time:new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(),critical:0,warning:0,info:0,other:0,resolved:0});return days.get(key)};
 for(const alert of rows){const triggered=alertTime(alert.triggered);if(triggered!==null)row(triggered)[['critical','warning','info'].includes(alert.severity)?alert.severity:'other']++;const resolved=alertTime(alert.resolvedAt);if(alert.status==='resolved'&&resolved!==null&&(bounds.start===null||resolved>=bounds.start)&&(bounds.end===null||resolved<=bounds.end))row(resolved).resolved++}return [...days.values()].sort((a,b)=>a.time-b.time);
}
