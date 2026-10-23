import {distinctStorage} from './proxmox-state';
export function storageCapacity(rows:any[]){
 const unique=distinctStorage(rows),measured=unique.filter(r=>!['offline','disabled','unavailable'].includes(r.status)&&Number.isFinite(r.capacity)&&r.capacity>0),usage=measured.filter(r=>Number.isFinite(r.used)&&r.used>=0&&r.used<=r.capacity),capacity=measured.reduce((n,r)=>n+r.capacity,0);
 return {unique,measured,capacity:measured.length?capacity:unique.length?null:0,used:usage.length?usage.reduce((n,r)=>n+r.used,0):unique.length?null:0,usedCapacity:usage.reduce((n,r)=>n+r.capacity,0),partial:unique.some(r=>r.status!=='disabled'&&!measured.includes(r))||usage.length!==measured.length};
}
export function storageDistribution(rows:any[]){return distinctStorage(rows).filter(r=>!['offline','disabled','unavailable'].includes(r.status)&&Number.isFinite(r.capacity)&&r.capacity>0).sort((a,b)=>b.capacity-a.capacity||a.id.localeCompare(b.id));}
