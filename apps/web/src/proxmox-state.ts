export function distinctStorage(rows:any[]){
 const groups=new Map<string,any>();
 for(const row of rows){const key=row.shared===true?`shared:${row.name}`:`local:${row.id}`;const old=groups.get(key);if(!old||(old.status!=='online'&&row.status==='online')||(old.status===row.status&&old.capacity==null&&row.capacity!=null))groups.set(key,row);}
 return [...groups.values()];
}
export function taskState(t:any){return ['running','RUNNING'].includes(t.status)||(!t.endtime&&!t.status)?'Running':(t.exitstatus||t.status)==='OK'?'Completed':!t.status?'Unknown':'Failed';}
export function inventoryComplete(data:any,error?:string){return !!data&&!error&&!data.errors?.length;}
