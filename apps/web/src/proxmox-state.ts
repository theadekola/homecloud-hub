export function distinctStorage(rows:any[]){
 const groups=new Map<string,any>();
 for(const row of rows.filter(row=>row.applicable!==false)){const key=row.shared===true?`shared:${row.name}`:`local:${row.id}`;const old=groups.get(key);if(!old||(old.status!=='online'&&row.status==='online')||(old.status===row.status&&old.capacity==null&&row.capacity!=null))groups.set(key,row);}
 return [...groups.values()];
}
export function taskState(t:any){const status=String(t.status||'').toLowerCase(),outcome=t.exitstatus||t.status;if(status==='running'||!t.status&&!t.endtime)return 'Running';if(outcome==='OK')return 'Completed';return !outcome||['stopped','unknown'].includes(String(outcome).toLowerCase())?'Unknown':'Failed';}
export function inventoryComplete(data:any,error?:string){
 if(!data||error||data.errors?.length||data.truncated?.length||data.coverage?.complete===false)return false;
 const sources:any[]=[...Object.values(data.providerInventory||{}),...(data.archiveInventory?[data.archiveInventory]:[])].filter((source:any)=>source.configured);
 return !(data.providerInventory||data.archiveInventory)||sources.length>0&&sources.every(source=>source.complete===true);
}
export function archiveInventoryComplete(data:any,error?:string){return !!data&&!error&&!data.errors?.length&&(!data.archiveInventory||data.archiveInventory.configured===true&&data.archiveInventory.complete===true);}

// A failed archive store must not hide a successfully read jobs list.
export function sourceInventoryComplete(data:any,key:string,error?:string){
 if(!data||error)return false;
 const source=data.providerInventory?.[key];
 return source?source.configured===true&&source.complete===true:inventoryComplete(data,error);
}
