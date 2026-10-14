import {distinctStorage} from './proxmox-state';
export function storageCapacity(rows:any[]){
 const unique=distinctStorage(rows),measured=unique.filter(r=>Number.isFinite(r.capacity)&&r.capacity>0),capacity=measured.reduce((n,r)=>n+r.capacity,0),usedKnown=measured.every(r=>Number.isFinite(r.used)&&r.used>=0&&r.used<=r.capacity);
 return {unique,measured,capacity:measured.length?capacity:unique.length?null:0,used:usedKnown?measured.reduce((n,r)=>n+r.used,0):null,partial:unique.some(r=>r.status!=='disabled'&&!(Number.isFinite(r.capacity)&&r.capacity>0))};
}
export function storageDistribution(rows:any[]){return distinctStorage(rows).filter(r=>Number.isFinite(r.capacity)&&r.capacity>0).sort((a,b)=>b.capacity-a.capacity||a.id.localeCompare(b.id));}
