import {isIP} from 'node:net';
export const NETWORK_FRESH_MS=20000;
const uint64=18446744073709551615n;
const count=v=>{if(Number.isSafeInteger(v)&&v>=0)return String(v);if(typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=uint64)return v;return null;};
const cidr=v=>{if(typeof v!=='string'||v.length>80)return false;const [ip,prefix,...rest]=v.split('/'),family=isIP(ip);return !rest.length&&family&&/^(0|[1-9][0-9]{0,2})$/.test(prefix)&&Number(prefix)<=(family===4?32:128);};
export function acceptNetworkReport(previous,input,now=Date.now()){
 const invalid=()=>({status:'error',message:'The connector sent an invalid network report.',receivedAt:now,interfaces:[]});
 if(!input||typeof input!=='object')return invalid();
 if(input.status==='error')return {status:'error',message:'The connector could not read local network interfaces. Check iproute2 and access to /sys/class/net.',receivedAt:now,interfaces:[]};
 if(input.status!=='ok'||!Number.isFinite(input.uptime)||input.uptime<0||input.uptime>1e12||typeof input.bootId!=='string'||! /^[A-Za-z0-9-]{1,64}$/.test(input.bootId)||!Array.isArray(input.interfaces)||input.interfaces.length>512)return invalid();
 const names=new Set(),rows=[];
 for(const r of input.interfaces){
  if(!r||typeof r.name!=='string'||['.','..'].includes(r.name)||! /^[A-Za-z0-9_.:-]{1,15}$/.test(r.name)||names.has(r.name)||!Number.isInteger(r.ifindex)||r.ifindex<1||!Array.isArray(r.addresses)||r.addresses.length>64||r.addresses.some(a=>!cidr(a)))return invalid();
  names.add(r.name);
  const mac=typeof r.mac==='string'&&/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i.test(r.mac)?r.mac.toLowerCase():null;
  const speed=Number.isFinite(r.speed)&&r.speed>0&&r.speed<=1e6?r.speed:null;
  rows.push({name:r.name,ifindex:r.ifindex,mac,addresses:[...new Set(r.addresses)],speed,speedReason:speed?null:({virtual:'Not applicable to a virtual interface','link-down':'Link is down',unsupported:'Link speed is not supported by this device',unavailable:'Link speed could not be read'}[r.speedReason]||'Link speed could not be read'),rxBytes:count(r.rxBytes),txBytes:count(r.txBytes)});
 }
 if(previous?.status==='ok'&&previous.bootId===input.bootId&&input.uptime<=previous.uptime)return previous;
 const elapsed=previous?.status==='ok'&&previous.bootId===input.bootId?input.uptime-previous.uptime:null;
 for(const r of rows){
  const old=previous?.interfaces.find(p=>p.name===r.name&&p.ifindex===r.ifindex&&p.mac===r.mac);
  for(const [counter,rate,reason] of [['rxBytes','rxMbps','rxReason'],['txBytes','txMbps','txReason']]){
   r[rate]=null;r[reason]=r[counter]==null?'Byte counter is unavailable':'Collecting two samples';
   if(elapsed>0&&elapsed<=30&&old?.[counter]!=null&&r[counter]!=null){const delta=BigInt(r[counter])-BigInt(old[counter]);if(delta<0){r[reason]='Counter reset; collecting a new sample';}else if(delta<=BigInt(Number.MAX_SAFE_INTEGER)){const value=Number(delta)*8/elapsed/1e6;if(Number.isFinite(value)){r[rate]=value;r[reason]=null;}}}
  }
 }
 return {status:'ok',bootId:input.bootId,uptime:input.uptime,receivedAt:now,sampledAt:new Date(now).toISOString(),interfaces:rows};
}
export function nodeNetworkTelemetry(node,reports,now=Date.now()){
 const exact=reports.filter(r=>r.kind==='proxmox'&&r.hostname===node),matches=exact.length?exact:reports.filter(r=>r.kind==='proxmox'&&r.hostname?.includes('.')&&r.hostname.split('.')[0]===node);
 const missing=(status,message)=>({status,message,interfaces:[]});
 if(!matches.length)return missing('unpaired','Pair this Proxmox node to read live interface addresses, link speed and RX/TX.');
 if(matches.length!==1)return missing('ambiguous','Multiple connectors match this node. Keep one paired connector for this host.');
 const r=matches[0];if(!r.online)return missing('offline','The paired node connector is offline.');
 if(r.version<3)return missing('update-required','Update this node connector to version 3 for live interface readings.');
 if(!r.network)return missing('waiting','Waiting for the connector network report.');
 if(now-r.network.receivedAt>NETWORK_FRESH_MS)return missing('stale','Network readings are stale. Check the node connector.');
 if(r.network.status!=='ok')return missing('error',r.network.message);
 return {...r.network,message:null};
}
