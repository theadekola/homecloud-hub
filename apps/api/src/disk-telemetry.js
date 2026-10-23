// Physical leaf block devices only: partitions and stacked logical devices would
// count the same I/O more than once. Keep bounded, process-local sampled history.
const histories=new Map();
export function acceptDiskReport(previous,input,now=Date.now()){
 const error={status:'error',receivedAt:now,devices:[],series:[]};
 if(input?.status!=='ok'||typeof input.bootId!=='string'||!/^[A-Za-z0-9-]{1,64}$/.test(input.bootId)||!Number.isFinite(input.uptime)||input.uptime<0||!Array.isArray(input.devices)||input.devices.length>512)return error;
 if(previous?.bootId===input.bootId&&input.uptime<=previous.uptime)return previous;
 const names=new Set(),devices=[];
 for(const d of input.devices){if(!d||!/^\d+:\d+$/.test(d.id)||names.has(d.id)||!['read','write'].every(k=>typeof d[k]==='string'&&/^(0|[1-9]\d{0,19})$/.test(d[k])))return error;names.add(d.id);devices.push({id:d.id,read:d.read,write:d.write});}
 const dt=previous?.status==='ok'&&previous.bootId===input.bootId?input.uptime-previous.uptime:0;
 let diskRead=null,diskWrite=null;
 if(dt>0&&dt<=30&&devices.length&&devices.length===previous.devices.length){let read=0n,write=0n,valid=true;for(const d of devices){const old=previous.devices.find(p=>p.id===d.id);if(!old){valid=false;break}const r=BigInt(d.read)-BigInt(old.read),w=BigInt(d.write)-BigInt(old.write);if(r<0n||w<0n){valid=false;break}read+=r;write+=w;}if(valid&&read<=BigInt(Number.MAX_SAFE_INTEGER)&&write<=BigInt(Number.MAX_SAFE_INTEGER)){diskRead=Number(read)*512/dt;diskWrite=Number(write)*512/dt;}}
 return {status:'ok',bootId:input.bootId,uptime:input.uptime,receivedAt:now,devices,diskRead,diskWrite};
}
export function recordDiskReport(id,previous,input,now=Date.now()){
 const report=acceptDiskReport(previous,input,now);if(report===previous)return report;
 const history=histories.get(id)||[];history.push({time:now,diskRead:report.diskRead??null,diskWrite:report.diskWrite??null});
 // One point per 30 seconds, up to 24 hours. Never persist device counters.
 if(history.length>1&&Math.floor(now/30000)===Math.floor(history.at(-2).time/30000))history.splice(-2,1);
 histories.set(id,history.filter(p=>now-p.time<=86400000).slice(-2880));return report;
}
export function nodeDiskTelemetry(node,reports,timeframe='day',now=Date.now()){
 const exact=reports.filter(r=>r.kind==='proxmox'&&r.hostname===node),matches=exact.length?exact:reports.filter(r=>r.kind==='proxmox'&&r.hostname?.split('.')[0]===node);
 const unavailable=message=>({series:[],message,source:'connector',current:null});
 if(matches.length!==1)return unavailable(matches.length?'Multiple connectors match this node.':'Update and pair this node connector to collect physical disk throughput.');
 const r=matches[0],d=r.disk;
 if(!r.online)return unavailable('The node connector is offline.');
 if(!d)return unavailable('Update this node connector for physical disk throughput.');
 if(now-d.receivedAt>20000)return unavailable('Disk readings are stale. Check the node connector.');
 if(d.status!=='ok')return unavailable('The connector could not read local disk counters.');
 const limit=timeframe==='hour'?3600000:86400000;
 return {source:'connector',current:{time:d.receivedAt,diskRead:d.diskRead,diskWrite:d.diskWrite},series:(histories.get(r.id)||[]).filter(p=>now-p.time<=limit),message:d.diskRead==null?'Collecting two valid disk samples; no physical disks, a counter reset or device changes can delay readings.':null};
}
