export function mergeNodeStorage(resources,node,rows){
 for(const row of rows){
  if(!row.storage)continue;
  const existing=resources.find(r=>r.type==='storage'&&r.node===node&&r.storage===row.storage);
  const value={id:existing?.id||`storage/${node}/${row.storage}`,type:'storage',node,storage:row.storage,plugintype:row.type??existing?.plugintype,status:row.enabled===0?'disabled':row.active===1?'online':row.active===0?'offline':existing?.status||'unknown',maxdisk:row.total??existing?.maxdisk,disk:row.used??existing?.disk,available:row.avail??null,content:row.content,shared:row.shared};
  if(existing)Object.assign(existing,value);else resources.push(value);
 }
}
