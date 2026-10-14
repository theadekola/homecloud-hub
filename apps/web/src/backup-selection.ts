export function backupTargets(resources:any[],node:string){return resources.filter(r=>r.node===node&&r.status==='online'&&String(r.content||'').split(',').includes('backup'));}
export function guestTargets(guests:any[],node:string){return guests.filter(g=>g.node===node);}
export function restoreLocation(archiveId:string){return `/restore?archive=${encodeURIComponent(archiveId)}`;}
