const measured=(value:any)=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const total=(rows:any[],key:string)=>rows.length?rows.reduce((sum,row)=>sum+row[key],0):null;

/** Sum matching live readings, never substitute offline or absent values with zero. */
export function proxmoxAvailability(data:any){
 const nodes=data?.nodes||[],online=nodes.filter((n:any)=>n.status==='online');
 const onlineNames=new Set(online.map((n:any)=>n.name));
 const cpu=online.filter((n:any)=>measured(n.cpu)&&measured(n.cores)&&n.cores>0);
 const memory=online.filter((n:any)=>measured(n.memoryBytes)&&measured(n.memoryTotal)&&n.memoryTotal>0);
 const stores=(data?.storage||[]).filter((s:any)=>onlineNames.has(s.node)&&!['offline','disabled','unavailable'].includes(s.status));
 const storage=stores.filter((s:any)=>measured(s.used)&&measured(s.capacity)&&s.capacity>0);
 const partial=online.length!==nodes.length||cpu.length!==online.length||memory.length!==online.length||storage.length!==(data?.storage||[]).length;
 return {online,cpu,memory,storage,partial,
  cpuUsed:cpu.length?cpu.reduce((sum:number,n:any)=>sum+n.cores*n.cpu/100,0):null,cores:total(cpu,'cores'),
  usedMemory:total(memory,'memoryBytes'),totalMemory:total(memory,'memoryTotal'),usedStorage:total(storage,'used'),totalStorage:total(storage,'capacity'),
  coverage:`${online.length}/${nodes.length} nodes online · CPU ${cpu.length}/${online.length} · memory ${memory.length}/${online.length} · storage ${storage.length}/${(data?.storage||[]).length} entries measured`,
 };
}

export function guestAvailability(rows:any[]){
 const live=rows.filter(row=>row.nodeAvailable!==false&&row.status!=='unknown');
 const memory=live.filter(row=>measured(row.memory)&&measured(row.memoryTotal)&&row.memoryTotal>0);
 const disk=live.filter(row=>measured(row.disk)&&measured(row.diskTotal)&&row.diskTotal>0);
 return {memory:total(memory,'memory'),memoryTotal:total(memory,'memoryTotal'),disk:total(disk,'disk'),diskTotal:total(disk,'diskTotal'),
  coverage:`Memory ${memory.length}/${rows.length} · disk ${disk.length}/${rows.length} guests measured. Missing or offline readings are excluded.`};
}
