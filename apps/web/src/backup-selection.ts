export function backupTargets(resources:any[],node:string){return resources.filter(r=>r.node===node&&r.status==='online'&&String(r.content||'').split(',').includes('backup'));}
export function guestTargets(guests:any[],node:string){return guests.filter(g=>g.node===node);}
export function restoreLocation(archiveId:string){return `/restore?archive=${encodeURIComponent(archiveId)}`;}

// Storage names alone never prove that archives on different nodes are shared.
export function distinctBackupPoints(points:any[],preferredId=''){
 const groups=new Map<string,any>();
 for(const point of points){const key=JSON.stringify([point.shared===true?'shared':'local',point.shared===true?'':point.node,point.storage,point.volid||point.id]);if(!groups.has(key)||point.id===preferredId)groups.set(key,point);}
 return Array.from(groups.values());
}
