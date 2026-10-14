const fail=message=>{throw Object.assign(new Error(message),{status:400})};
export async function validateBackupSelection(input,query){
 const {node,storage}=input;
 if(typeof node!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(node))fail('Valid node is required');
 if(typeof storage!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(storage))fail('Backup storage is required');
 const stores=await query(`/nodes/${encodeURIComponent(node)}/storage`),target=Array.isArray(stores)&&stores.find(s=>s.storage===storage);
 if(!target||target.active!==1||target.enabled===0||!String(target.content||'').split(',').includes('backup'))fail(`Backup storage ${storage} is not available on node ${node} or does not support backup content`);
 const ids=String(input.vmid||'').trim().split(/[, ]+/);
 if(!ids.length||ids.some(id=>!/^\d+$/.test(id)||Number(id)<100))fail('Guest IDs must be numbers of at least 100');
 const resources=await query('/cluster/resources');
 if(!Array.isArray(resources)||ids.some(id=>!resources.some(r=>String(r.vmid)===String(Number(id))&&r.node===node&&['qemu','lxc'].includes(r.type))))fail('Selected guests must belong to the selected node');
 return {node,storage,vmid:ids.join(',')};
}
