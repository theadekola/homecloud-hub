import net from 'node:net';
const text=(v,n=100)=>typeof v==='string'?v.slice(0,n):'';
const number=(v,min,max)=>(typeof v==='number'||typeof v==='string'&&v!=='')&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
export function publicOperations(input,receivedAt=Date.now(),previous=null){
 if(!input||typeof input!=='object')return null;
 if(previous&&previous.sampledAt===input.sampledAt)return previous;
 const list=(v,n)=>Array.isArray(v)?v.slice(0,n):[];
 const key=v=>typeof v==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(v)?v:null;
 return {receivedAt,sampledAt:number(input.sampledAt,0,1e12),disks:list(input.disks,16).map(r=>({name:text(r?.name),healthy:typeof r?.healthy==='boolean'?r.healthy:null})),ups:list(input.ups,8).map(r=>({name:text(r?.name),status:text(r?.status,80),charge:number(r?.charge,0,100),runtime:number(r?.runtime,0,1e9)})),vpn:{lan:{clientNetworks:list(input.vpn?.lan?.clientNetworks,32).map(n=>text(n,32)),rules:list(input.vpn?.lan?.rules,64).map(r=>({publicKey:key(r?.publicKey),destination:text(r?.destination,32),protocol:text(r?.protocol,3),port:number(r?.port,1,65535),interface:text(r?.interface,15),nat:r?.nat===true}))},status:input.vpn?.status==='configured'?'configured':'not-configured',publicKey:key(input.vpn?.publicKey),address:typeof input.vpn?.address==='string'&&net.isIPv4(input.vpn.address.split('/')[0])&&input.vpn.address.endsWith('/24')?input.vpn.address:null,peers:list(input.vpn?.peers,128).filter(r=>key(r?.publicKey)).map(r=>({publicKey:r.publicKey,address:text(r.address,100),lastHandshake:number(r.lastHandshake,0,1e12)}))},errors:list(input.errors,32).map(v=>text(v,240))};
}
export function operationsView(nodes,now=Date.now()){
 return {sampledAt:new Date(now).toISOString(),nodes:nodes.map(n=>({id:n.id,name:n.name,online:n.online,version:n.version,status:!n.online?'offline':n.version<7?'update-required':!n.operations?'waiting':now-n.operations.receivedAt>180000?'stale':'current',...{report:n.operations||null}}))};
}
export function operationalConditions(view){
 const rows=[];
 for(const node of view.nodes.filter(n=>n.status==='current')){
  const add=(id,title,severity,details)=>rows.push({key:`operations:${node.id}:${id}`,connectorId:`operations:${node.id}`,provider:'hardware',source:node.name,title,severity,details});
  for(const disk of node.report.disks)if(disk.healthy===false)add('disk:'+disk.name,'Disk health failure','critical',`${disk.name} reports a failed SMART health assessment. Protect data and inspect the disk.`);
  for(const ups of node.report.ups){const flags=ups.status.split(/\s+/);if(flags.includes('LB'))add('ups:'+ups.name,'UPS battery low','critical','Protect workloads and check the UPS shutdown policy.');else if(flags.includes('OB'))add('ups:'+ups.name,'UPS running on battery','warning','Mains power is unavailable. Check remaining runtime.');}
 }
 return rows;
}
export function validateOperationalAction(body){
 const fail=m=>{throw Object.assign(Error(m),{status:400})};
 if(!body||typeof body!=='object')fail('Invalid operational request');
 const action=body.action;
 if(!['network-check','install-tools','vpn-setup','vpn-add','vpn-remove','vpn-lan'].includes(action))fail('Unsupported operational action');
 const result={action};
 if(action==='vpn-lan'){
  if(body.authorized!==true||!Array.isArray(body.rules)||body.rules.length>64)fail('Explicit authorization and up to 64 service grants required');
  const networks=body.clientNetworks??[];
  if(!Array.isArray(networks)||networks.length>32||networks.some(n=>typeof n!=='string'||!net.isIPv4(n.split('/')[0])||!/^\d+\.\d+\.\d+\.\d+\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(n)))fail('Invalid remote-device IPv4 networks');
  result.clientNetworks=networks;result.authorized=true;result.rules=body.rules.map(r=>{
   if(!r||typeof r.publicKey!=='string'||! /^[A-Za-z0-9+/]{43}=$/.test(r.publicKey))fail('Invalid device public key');
   if(typeof r.destination!=='string'||!net.isIPv4(r.destination.split('/')[0])||!r.destination.endsWith('/32')||! /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(r.destination))fail('Choose a private server IPv4 /32');
   if(!['tcp','udp'].includes(r.protocol)||!Number.isInteger(r.port)||r.port<1||r.port>65535||typeof r.interface!=='string'||! /^[A-Za-z0-9_.:-]{1,15}$/.test(r.interface)||['lo','icvpn'].includes(r.interface)||typeof r.nat!=='boolean')fail('Invalid service protocol, port, LAN interface or NAT mode');
   return {publicKey:r.publicKey,destination:r.destination,protocol:r.protocol,port:r.port,interface:r.interface,nat:r.nat};
  });
 }

 if(action==='vpn-setup'){
  if(typeof body.address!=='string'||!/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(body.address)||!net.isIPv4(body.address.split('/')[0])||!body.address.endsWith('/24'))fail('Use a private IPv4 /24 gateway address');
  if(!Number.isInteger(body.port)||body.port<1024||body.port>65535)fail('Invalid UDP port');Object.assign(result,{address:body.address,port:body.port});
 }
 if(action==='vpn-add'||action==='vpn-remove'){
  if(typeof body.publicKey!=='string'||! /^[A-Za-z0-9+/]{43}=$/.test(body.publicKey)||Buffer.from(body.publicKey,'base64').length!==32)fail('Invalid WireGuard public key');result.publicKey=body.publicKey;
  if(action==='vpn-add'){if(typeof body.address!=='string'||!net.isIPv4(body.address.split('/')[0])||!body.address.endsWith('/32'))fail('Use a device IPv4 /32 address');result.address=body.address;}
 }
 return result;
}
export function operationalRecovery(alert,view){
 const node=view?.nodes?.find(n=>alert.connectorId===`operations:${n.id}`);if(node?.status!=='current')return false;
 const suffix=alert.key?.slice(`operations:${node.id}:`.length);
 if(suffix?.startsWith('disk:'))return node.report.disks.some(r=>r.name===suffix.slice(5)&&r.healthy===true);
 if(suffix?.startsWith('ups:'))return node.report.ups.some(r=>r.name===suffix.slice(4)&&r.status.split(/\s+/).includes('OL')&&!r.status.split(/\s+/).some(v=>['OB','LB'].includes(v)));
 return false;
}
