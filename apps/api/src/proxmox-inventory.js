export function mergeNodeStorage(resources,node,rows){
 for(const row of rows){
  if(!row.storage)continue;
  const existing=resources.find(r=>r.type==='storage'&&r.node===node&&r.storage===row.storage);
  const value={id:existing?.id||`storage/${node}/${row.storage}`,type:'storage',node,storage:row.storage,plugintype:row.type??existing?.plugintype,status:row.enabled===0?'disabled':row.active===1?'online':row.active===0?'offline':'unknown',maxdisk:row.total??null,disk:row.used??null,available:row.avail??null,content:row.content,shared:row.shared};
  if(existing)Object.assign(existing,value);else resources.push(value);
 }
}

// A successful /nodes read defines current visible membership. Cluster resources
// can retain old node/guest/storage references after a node leaves the cluster.
export function reconcileNodeInventory(resources,listed){
 if(!Array.isArray(listed)||listed.some(row=>!row||typeof row.node!=='string'||!row.node.trim()))throw Error('Unexpected node inventory');
 const members=new Set(listed.map(row=>row.node));
 const current=resources.filter(row=>!['node','qemu','lxc','storage'].includes(row.type)||members.has(row.node)).map(row=>({...row}));
 for(const node of listed){const existing=current.find(row=>row.type==='node'&&row.node===node.node);if(existing)Object.assign(existing,node);else current.push({...node,type:'node'});}
 return {resources:current,nodeInventory:{complete:true,members:[...members]}};
}
