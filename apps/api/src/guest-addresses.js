import {isIP} from 'node:net';
// Read runtime interfaces only. Never substitute a configured subnet or gateway.
export function guestAddresses(input){
 const rows=Array.isArray(input)?input:Array.isArray(input?.result)?input.result:[];
 const addresses=[];
 for(const row of rows){
  if(/^(lo$|docker\d*$|veth|br-[a-f0-9]{12}$|virbr|cni|flannel)/i.test(row.name||row.ifname||''))continue;
  for(const value of [row.inet,row.inet6,...(row['ip-addresses']||[]).map(a=>a['ip-address'])]){
   if(typeof value!=='string')continue;const ip=value.split('/')[0],family=isIP(ip);
   if(!family||ip==='::'||ip==='::1'||ip==='0.0.0.0'||ip.startsWith('127.')||ip.startsWith('169.254.')||/^fe[89ab]/i.test(ip)||/^ff/i.test(ip))continue;
   addresses.push(ip);
  }
 }
 return [...new Set(addresses)].sort((a,b)=>isIP(a)-isIP(b)||a.localeCompare(b)).slice(0,32);
}
export function createGuestAddressReader({budget=100,ttl=30000,fresh=60000,clock=Date.now}={}){
 const connections=new Map();
 return async(guests,query,identity)=>{
  let state=connections.get(identity);if(!state){state={values:new Map(),pending:null,time:-Infinity};connections.set(identity,state);if(connections.size>16)connections.delete(connections.keys().next().value);}
  const active=guests.filter(g=>g.status==='running'&&g.nodeAvailable!==false),key=g=>`${g.node}/${g.type}/${g.vmid}`;
  if(!state.pending&&clock()-state.time>=ttl){
   const keys=new Set(active.map(key));for(const k of state.values.keys())if(!keys.has(k))state.values.delete(k);
   state.pending=(async()=>{let index=0;const worker=async()=>{while(index<active.length){const guest=active[index++],id=key(guest);try{const base=`/nodes/${encodeURIComponent(guest.node)}/${guest.type}/${encodeURIComponent(guest.vmid)}`,data=await query(base+(guest.type==='qemu'?'/agent/network-get-interfaces':'/interfaces'),{timeoutMs:3000});state.values.set(id,{addresses:guestAddresses(data),sampledAt:clock()});}catch{state.values.set(id,{addresses:[],sampledAt:clock(),failed:true});}}};await Promise.all(Array.from({length:Math.min(4,active.length)},worker));state.time=clock();})().finally(()=>{state.pending=null;});
  }
  if(state.pending){let timer;await Promise.race([state.pending,new Promise(resolve=>{timer=setTimeout(resolve,budget)})]).finally(()=>clearTimeout(timer));}
  return new Map(guests.map(g=>{const value=state.values.get(key(g)),available=g.status==='running'&&g.nodeAvailable!==false,valid=available&&value&&!value.failed&&clock()-value.sampledAt<=fresh;return [key(g),{addresses:valid?value.addresses:[],addressStatus:!available?'unavailable':value&&clock()-value.sampledAt>fresh?'stale':value?.failed?'unavailable':value?'reported':'collecting',addressSampledAt:valid?new Date(value.sampledAt).toISOString():null,addressSource:g.type==='qemu'?'QEMU guest agent':'CT runtime interfaces'}]}));
 };
}
