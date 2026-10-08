import {pve} from './connectors.js';
import {encode,required,integer,httpError,pveWrite} from './infrastructure.js';
export async function networkInventory(){
 const nodes=await pve('/nodes'),interfaces=[],errors=[];
 for(let i=0;i<nodes.length;i+=5)await Promise.all(nodes.slice(i,i+5).map(async n=>{
  try{for(const row of await pve(`/nodes/${encode(n.node)}/network`))interfaces.push({...row,id:`${n.node}/${row.iface}`,node:n.node,name:row.iface,address:row.cidr||row.address||null,status:row.active===1?'up':row.active===0?'down':'unknown'});}catch(e){errors.push(`${n.node}: ${e.message}`);}
 }));
 return {nodes,interfaces,errors,sampledAt:new Date().toISOString()};
}
export async function networkDetails(node,period){
 const timeframe=['hour','day','week','month'].includes(period)?period:'day',result={node,errors:[]};
 await Promise.all([['dns',`/nodes/${encode(node)}/dns`],['history',`/nodes/${encode(node)}/rrddata?timeframe=${timeframe}&cf=AVERAGE`]].map(async([key,path])=>{try{result[key]=await pve(path);}catch(e){result.errors.push(`${key}: ${e.message}`);}}));
 return result;
}
export function networkWrite(node,input,edit=false){
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
 if(!edit)body.iface=iface;
 return pveWrite(`/nodes/${encode(node)}/network${edit?`/${encode(iface)}`:''}`,edit?'PUT':'POST',body);
}
