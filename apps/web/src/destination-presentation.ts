export const destinationCategory=(row:any)=>['dir','lvm','lvmthin','zfspool','btrfs'].includes(row.type)?'Local':['nfs','cifs','pbs','cephfs','rbd','glusterfs','iscsi','iscsidirect'].includes(row.type)?'Network':'Other';

// A zero total is the provider's unavailable reading, not an empty usable store.
export function destinationReading(row:any){
 const capacity=Number.isFinite(row.capacity)&&row.capacity>0?row.capacity:null;
 const valid=(value:any)=>capacity!==null&&Number.isFinite(value)&&value>=0&&value<=capacity?value:null;
 const used=valid(row.used),available=valid(row.available);
 return {capacity,used,available,percent:capacity!==null&&used!==null?used/capacity*100:null};
}
export function destinationEndpoint(row:any){
 return row.server&&row.export?`${row.server}:${row.export}`:row.path||row.server||row.portal||'Not reported';
}
export function destinationHistory(rows:any[]){
 const points=new Map<number,any>();
 for(const row of rows){
  if(!Number.isFinite(row.time)||row.time<=0)continue;
  const total=Number.isFinite(row.total)&&row.total>0?row.total:null;
  const unusableTotal=row.total!=null&&total===null;
  const used=!unusableTotal&&Number.isFinite(row.used)&&row.used>=0&&(total===null||row.used<=total)?row.used:null;
  points.set(row.time,{time:row.time*1000,total:total===null?null:total/1024**3,used:used===null?null:used/1024**3});
 }
 return [...points.values()].sort((a,b)=>a.time-b.time);
}
