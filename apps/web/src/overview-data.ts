import {distinctBackupPoints} from './backup-selection';
const measured=(rows:any[],key:string)=>{const values=rows.map(r=>r[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));return values.length?values.reduce((sum,v)=>sum+v,0)/values.length:null;};
export function overviewData(data:any,backup:any,node:string,search:string){
 const nodes=(data.nodes||[]).filter((n:any)=>!node||n.name===node);
 const guests=(data.guests||[]).filter((g:any)=>!node||g.node===node);
 const storage=(data.storage||[]).filter((s:any)=>!node||s.node===node);
 const inventory=(data.resources||[]).filter((r:any)=>!node||r.host===node||r.node===node);
 const resources=inventory.filter((r:any)=>(r.name+' '+r.host+' '+r.kind).toLowerCase().includes(search.toLowerCase()));
 const belongs=(a:any)=>a.node===node||a.source===node||[...(data.storage||[]),...(data.nodes||[]),...(data.guests||[]),...(data.resources||[])].some((r:any)=>String(r.id)===String(a.resourceId)&&(r.node===node||r.name===node||r.host===node));
 const alerts=(data.alerts||[]).filter((a:any)=>a.status!=='resolved'&&(!node||belongs(a)));
 const reporting=nodes.filter((n:any)=>n.status==='online');
 const proxmox=(data.services||[]).find((s:any)=>s.provider==='proxmox'||s.name==='proxmox');
 const inventoryKnown=proxmox?.status==='reachable';
 const dockerKnown=(data.services||[]).filter((s:any)=>s.provider==='docker'||s.name==='docker').every((s:any)=>s.status==='reachable');
 const backupErrors=backup?.errors||[];
 const backupKnown=!!backup&&(backup.archiveInventory?backup.archiveInventory.configured===true&&backup.archiveInventory.complete===true:!backupErrors.length);
 const backupIssue=backup?.archiveInventory?.issues?.find((issue:any)=>issue.code==='storage-unavailable'&&(!node||issue.node===node));
 const jobsKnown=!!backup&&(backup.providerInventory?.jobs?backup.providerInventory.jobs.configured===true&&backup.providerInventory.jobs.complete===true:!backupErrors.length);
 const backupDetail=!backup?'Not measured':backup.archiveInventory?.configured===false?'Connect Proxmox to discover archives':backupIssue?`${backupIssue.node}/${backupIssue.storage} unavailable`:!backupKnown?'Inventory incomplete or unavailable':backup.archiveInventory?.visibleStorage===0?'No Proxmox backup storage visible':'Proxmox backup archives';
 const points=distinctBackupPoints((backup?.points||[]).filter((p:any)=>!node||p.node===node));
 const backupCount=backupKnown||points.length>0?points.length:null;
 const jobs=(backup?.jobs||[]).filter((j:any)=>!node||!j.node||j.node===node);
 return {nodes,guests,storage,inventory,resources,alerts,cpu:measured(reporting,'cpu'),memory:measured(reporting,'memoryPercent'),disk:measured(storage.filter((s:any)=>s.status==='online'),'usage'),inventoryKnown,dockerKnown,points,jobs,backupErrors,backupKnown,backupDetail,backupCount,backupIssue,jobsKnown};
}
