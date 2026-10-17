export function distinctStorage(rows:any[]){
 const groups=new Map<string,any>();
 for(const row of rows){const key=row.shared===true?`shared:${row.name}`:`local:${row.id}`;const old=groups.get(key);if(!old||(old.status!=='online'&&row.status==='online')||(old.status===row.status&&old.capacity==null&&row.capacity!=null))groups.set(key,row);}
 return [...groups.values()];
}
export function taskState(t:any){return ['running','RUNNING'].includes(t.status)||(!t.endtime&&!t.status)?'Running':(t.exitstatus||t.status)==='OK'?'Completed':!t.status?'Unknown':'Failed';}
export function inventoryComplete(data:any,error?:string){
 if(!data||error||data.errors?.length||data.truncated?.length||data.coverage?.complete===false)return false;
 const sources:any[]=[...Object.values(data.providerInventory||{}),...(data.archiveInventory?[data.archiveInventory]:[])].filter((source:any)=>source.configured);
 return !(data.providerInventory||data.archiveInventory)||sources.length>0&&sources.every(source=>source.complete===true);
}
export function archiveInventoryComplete(data:any,error?:string){return !!data&&!error&&!data.errors?.length&&(!data.archiveInventory||data.archiveInventory.configured===true&&data.archiveInventory.complete===true);}
