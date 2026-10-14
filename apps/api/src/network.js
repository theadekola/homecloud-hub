import net from 'node:net';
import {pve} from './connectors.js';
import {agentNetworkReports} from './node-agents.js';
import {nodeNetworkTelemetry} from './network-telemetry.js';
import {encode,required,integer,httpError,pveWrite} from './infrastructure.js';
export async function networkInventory(query=pve,reports=agentNetworkReports){
 const nodes=await query('/nodes'),interfaces=[],errors=[],telemetry=[];if(!Array.isArray(nodes))throw Object.assign(new Error('Invalid Proxmox node inventory'),{status:502});const reported=reports();
 for(let i=0;i<nodes.length;i+=5)await Promise.all(nodes.slice(i,i+5).map(async n=>{
  const reading=nodeNetworkTelemetry(n.node,reported);telemetry.push({node:n.node,status:reading.status,message:reading.message,sampledAt:reading.sampledAt||null});
  try{for(const row of await query(`/nodes/${encode(n.node)}/network`)){
   const runtime=reading.status==='ok'?reading.interfaces.find(r=>r.name===row.iface):null;
   const configuredAddresses=[row.cidr||row.address,row.cidr6||row.address6].filter(v=>typeof v==='string'&&v.length<=128),liveAddresses=runtime?.addresses||[],displayAddresses=[...new Set([...liveAddresses,...configuredAddresses])];
   const message=reading.message||(!runtime?'This interface is not reported by the connector.':null);
   interfaces.push({...row,id:`${n.node}/${row.iface}`,node:n.node,name:row.iface,address:configuredAddresses[0]||null,configuredAddresses,liveAddresses,displayAddresses,liveAddressesReported:!!runtime,speed:runtime?.speed??null,speedReason:message||runtime?.speedReason,rxMbps:runtime?.rxMbps??null,txMbps:runtime?.txMbps??null,rxReason:message||runtime?.rxReason,txReason:message||runtime?.txReason,telemetryStatus:reading.status,telemetryMessage:message,networkSampledAt:reading.sampledAt||null,status:[1,'1',true].includes(row.active)?'up':[0,'0',false].includes(row.active)?'down':'unknown'});
  }}catch(e){errors.push(`${n.node}: ${e.message}`);}
 }));
 return {nodes,interfaces,errors,telemetry,sampledAt:new Date().toISOString()};
}
export async function networkDetails(node,period){
 const timeframe=['hour','day','week','month'].includes(period)?period:'day',result={node,errors:[]};
 await Promise.all([['dns',`/nodes/${encode(node)}/dns`],['history',`/nodes/${encode(node)}/rrddata?timeframe=${timeframe}&cf=AVERAGE`]].map(async([key,path])=>{try{result[key]=await pve(path);}catch(e){result.errors.push(`${key}: ${e.message}`);}}));
 return result;
}
export function networkWrite(node,input,edit=false,write=pveWrite,query=pve){
 const iface=required(input.iface,'Interface name'),type=required(input.type,'Type');
 if(!/^[A-Za-z][A-Za-z0-9_.:-]{0,14}$/.test(iface))throw httpError('Invalid interface name');
 if(!['bridge','bond','vlan','eth'].includes(type)||(!edit&&type==='eth'))throw httpError('Unsupported interface type');
 const body={type};
 for(const key of ['cidr','cidr6','gateway','gateway6','bridge_ports','slaves','bond_mode','vlan-raw-device','comments'])if(typeof input[key]==='string'&&input[key].trim())body[key]=input[key].trim();
 for(const key of ['autostart','bridge_vlan_aware'])if(input[key]!=null)body[key]=input[key]===true||input[key]==='1'?1:0;
 if(input.mtu)body.mtu=integer(input.mtu,'MTU',1280,65520);
 if(input['vlan-id'])body['vlan-id']=integer(input['vlan-id'],'VLAN ID',1,4094);
 if(type==='bond'&&!edit){required(body.slaves,'Bond interfaces');required(body.bond_mode,'Bond mode');}
 if(type==='vlan'&&!edit){required(body['vlan-raw-device'],'Parent device');if(!body['vlan-id'])throw httpError('VLAN ID is required');}
 if(input.clear!==undefined){if(!edit||!Array.isArray(input.clear)||input.clear.some(key=>!['cidr','cidr6','gateway','gateway6','bridge_ports','comments'].includes(key)||body[key]!==undefined))throw httpError('Invalid network fields to clear');if(input.clear.length)body.delete=[...new Set(input.clear)].join(',');}
 if(!edit)body.iface=iface;
 const submit=()=>write(`/nodes/${encode(node)}/network${edit?`/${encode(iface)}`:''}`,edit?'PUT':'POST',body);
 if(input.expectedConfig!==undefined){
  const keys=['type','cidr','cidr6','gateway','gateway6','mtu','autostart','bridge_ports','bridge_vlan_aware','slaves','bond_mode','vlan-id','vlan-raw-device','comments'],expected=input.expectedConfig;
  if(!edit||!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).length!==keys.length||keys.some(key=>typeof expected[key]!=='string'||expected[key].length>65536))throw httpError('Invalid expected interface configuration');
  return (async()=>{const rows=await query(`/nodes/${encode(node)}/network`);if(!Array.isArray(rows))throw httpError('Interface configuration could not be verified',502);const current=rows.find(row=>row.iface===iface);if(!current||keys.some(key=>String(current[key]??'')!==expected[key]))throw httpError('Interface configuration changed. Reload it before saving.',409);return submit();})();
 }
 return submit();
}

// Proxmox replaces the complete resolver list. Preserve omitted fields and treat
// explicitly blank server fields as removal, after verifying the edit baseline.
export async function networkDnsWrite(node,input,query=pve,write=pveWrite){
 const keys=['search','dns1','dns2','dns3'];
 if(!input||typeof input!=='object'||Array.isArray(input))throw httpError('Invalid DNS configuration');
 const current=await query(`/nodes/${encode(node)}/dns`);
 if(!current||typeof current!=='object'||Array.isArray(current))throw httpError('DNS configuration could not be verified',502);
 const normalized=row=>Object.fromEntries(keys.map(key=>[key,String(row[key]??'').trim()]));
 const baseline=normalized(current);
 if(input.expectedConfig!==undefined){
  const expected=input.expectedConfig;
  if(!expected||typeof expected!=='object'||Array.isArray(expected)||Object.keys(expected).length!==keys.length||keys.some(key=>typeof expected[key]!=='string'||expected[key].length>1024))throw httpError('Invalid expected DNS configuration');
  if(keys.some(key=>expected[key]!==baseline[key]))throw httpError('DNS configuration changed. Reload it before saving.',409);
 }
 const values={...baseline};
 for(const key of keys)if(Object.hasOwn(input,key)){if(typeof input[key]!=='string'||input[key].length>1024)throw httpError('Invalid DNS field');values[key]=input[key].trim();}
 required(values.search,'Search domain');
 if(/[\r\n\0]/.test(values.search))throw httpError('Invalid search domain');
 const body={search:values.search};
 for(const key of keys.slice(1))if(values[key]){if(!net.isIP(values[key]))throw httpError('DNS servers must be IP addresses');body[key]=values[key];}
 return write(`/nodes/${encode(node)}/dns`,'PUT',body);
}

export async function networkFirewall(node,query=pve){
 const base=`/nodes/${encode(node)}/firewall`,result={rules:null,options:null,logs:null,errors:[]};
 await Promise.all([['rules','rules'],['options','options'],['logs','log?limit=50']].map(async([key,path])=>{
  try{const value=await query(`${base}/${path}`);if(key==='options'?(!value||typeof value!=='object'||Array.isArray(value)):!Array.isArray(value))throw Error('Invalid provider response');result[key]=value;}
  catch(e){result.errors.push(`${key}: ${e.message}`);}
 }));return result;
}
