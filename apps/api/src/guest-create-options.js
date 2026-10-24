import {isIP} from 'node:net';
import crypto from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
export function flag(value,fallback=false){if(value===undefined||value==='')return fallback;if([true,1,'1','true'].includes(value))return true;if([false,0,'0','false'].includes(value))return false;fail('Invalid boolean option');}
const text=(value,label,pattern,max=100)=>{if(typeof value!=='string'||value.length>max||!pattern.test(value))fail('Invalid '+label);return value;};
const optional=(value,label,pattern,max)=>value==null||value===''?undefined:text(value,label,pattern,max);
function cidr(value,family){const parts=String(value||'').split('/');if(parts.length!==2||isIP(parts[0])!==family||!/^\d+$/.test(parts[1])||Number(parts[1])>(family===4?32:128))fail('Invalid IPv'+family+' CIDR');return value;}
function mac(value){const result=optional(value,'MAC address',/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i);if(result&&(parseInt(result.slice(0,2),16)&1))fail('MAC address must be unicast');return result?.toUpperCase();}
export function guestNetwork(payload,kind){
 const bridge=text(payload.bridge||'vmbr0','network bridge',/^[A-Za-z0-9][A-Za-z0-9_.-]*$/),hardware=mac(payload.mac);
 const tag=payload.vlan==null||payload.vlan===''?undefined:Number(payload.vlan);if(tag!==undefined&&(!Number.isInteger(tag)||tag<1||tag>4094))fail('VLAN tag must be between 1 and 4094');
 const firewall=payload.firewall===undefined?undefined:flag(payload.firewall)?1:0;
 if(kind==='vm'){const model=payload.networkModel||'virtio';if(!['virtio','e1000','e1000e','rtl8139','vmxnet3'].includes(model))fail('Invalid network model');if(flag(payload.noNetwork))return undefined;return [hardware?`${model}=${hardware}`:model,`bridge=${bridge}`,tag===undefined?null:`tag=${tag}`,firewall===undefined?null:`firewall=${firewall}`].filter(Boolean).join(',');}
 const name=text(payload.interfaceName||'eth0','interface name',/^[A-Za-z][A-Za-z0-9_.-]{0,14}$/);
 const mode=payload.ipv4Mode||'dhcp',mode6=payload.ipv6Mode||'none';if(!['dhcp','static','none'].includes(mode)||!['none','static','dhcp','slaac'].includes(mode6))fail('Invalid IP assignment mode');
 const ip=mode==='static'?cidr(payload.ipv4,4):mode==='dhcp'?'dhcp':'manual',ip6=mode6==='static'?cidr(payload.ipv6,6):mode6==='slaac'?'auto':mode6==='dhcp'?'dhcp':payload.ipv6Mode===undefined?undefined:'manual';
 for(const [key,family,assignment] of [['gateway4',4,mode],['gateway6',6,mode6]])if(payload[key]&&(assignment!=='static'||isIP(payload[key])!==family))fail('Gateway requires a valid static IPv'+family+' configuration');
 return [`name=${name}`,`bridge=${bridge}`,`ip=${ip}`,ip6?`ip6=${ip6}`:null,hardware?`hwaddr=${hardware}`:null,tag===undefined?null:`tag=${tag}`,firewall===undefined?null:`firewall=${firewall}`,payload.gateway4?`gw=${payload.gateway4}`:null,payload.gateway6?`gw6=${payload.gateway6}`:null].filter(Boolean).join(',');
}
export function ctExtra(payload){
 if(payload.confirmPassword!==undefined&&payload.password!==payload.confirmPassword)fail('Passwords do not match');
 const unprivileged=flag(payload.unprivileged,true),nesting=payload.nesting===undefined?undefined:flag(payload.nesting);
 let nameserver;if(payload.nameserver){const servers=String(payload.nameserver).trim().split(/[\s,]+/);if(servers.length>3||servers.some(ip=>!isIP(ip)))fail('Enter up to three DNS server IP addresses');nameserver=servers.join(' ');}
 const searchdomain=optional(payload.searchdomain,'DNS search domain',/^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/,253);
 if(payload.sshKey&&(typeof payload.sshKey!=='string'||payload.sshKey.length>65536||payload.sshKey.includes('PRIVATE KEY')))fail('Enter public SSH keys only');
 return {unprivileged:unprivileged?1:0,features:nesting===undefined?undefined:`nesting=${nesting?1:0}`,nameserver,searchdomain};
}
export async function guestGeneral(payload,call){
 const pool=optional(payload.pool,'resource pool',/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/,100);
 if(pool){const pools=await call('/pools');if(!Array.isArray(pools)||!pools.some(p=>p.poolid===pool))fail('Selected resource pool is unavailable');}
 return {pool};
}
export async function allocateGuestId(payload,call){
 if(payload.guestId==null||payload.guestId==='')return call('/cluster/nextid');
 const id=Number(payload.guestId);if(!Number.isInteger(id)||id<100||id>999999999)fail('Guest ID must be an integer from 100 to 999999999');
 const resources=await call('/cluster/resources');if(!Array.isArray(resources))fail('Could not verify guest ID availability',502);if(resources.some(r=>String(r.vmid)===String(id)))fail('Guest ID is already in use',409);return id;
}
export async function creationOptions(node,call){
 text(node,'node',/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);const result={node,pools:[],bridges:[],nextId:null,errors:[]};
 await Promise.all([['pools','/pools'],['bridges',`/nodes/${encodeURIComponent(node)}/network`],['nextId','/cluster/nextid']].map(async([key,path])=>{try{const value=await call(path);if(key==='nextId'){if(!Number.isInteger(Number(value))||Number(value)<100)throw Error();result.nextId=Number(value);}else if(!Array.isArray(value))throw Error();else result[key]=key==='pools'?value.map(p=>({id:p.poolid})):value.filter(r=>['bridge','OVSBridge'].includes(r.type)).map(r=>({name:r.iface}));}catch{result.errors.push(key+' discovery unavailable. Check Proxmox permissions.');}}));return result;
}
const receipts=new Map();
export function registerCreation(result,kind,user){for(const [id,r]of receipts)if(r.expires<Date.now())receipts.delete(id);const id=crypto.randomUUID();receipts.set(id,{...result,kind,user,expires:Date.now()+1800000,state:'pending',busy:false});return {...result,ha:{state:'pending',receipt:id,message:'Creation is queued. Recheck HA after the creation task completes.'}};}
export async function completeCreationHa(id,user,call){
 const r=receipts.get(id);if(!r||r.expires<Date.now()||r.user!==user)fail('Creation receipt expired or unavailable',404);if(r.state==='configured')return {state:'configured',message:'HA configured with desired state stopped.'};if(r.busy)fail('HA configuration is already running',409);r.busy=true;
 try{const base=`/nodes/${encodeURIComponent(r.node)}`;const task=await call(`${base}/tasks/${encodeURIComponent(r.task)}/status`);if(task.status==='running')return {state:'pending',message:'Creation is still running. Recheck after it completes.'};if(task.status!=='stopped'||task.exitstatus!=='OK')fail('Creation did not complete successfully. Inspect its task; HA was not configured.',409);
  const resources=await call('/cluster/resources');if(!Array.isArray(resources)||!resources.some(g=>g.node===r.node&&String(g.vmid)===String(r.vmid)&&g.type===(r.kind==='vm'?'qemu':'lxc')))fail('New guest placement could not be verified',409);
  const runtime=await call(`${base}/${r.kind==='vm'?'qemu':'lxc'}/${r.vmid}/status/current`);if(runtime.status!=='stopped')fail('The new guest must remain stopped before adding HA. No power action was performed.',409);
  await call('/cluster/ha/resources',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({sid:`${r.kind==='vm'?'vm':'ct'}:${r.vmid}`,state:'stopped'}).toString()});r.state='configured';return {state:'configured',message:'HA configured with desired state stopped. Start the guest through Proxmox HA when ready.'};
 }finally{r.busy=false;}
}

// Structured wizard options only. Never pass arbitrary QEMU property strings through.
export function vmHardware(payload,{storage,diskBus,memory,cores}){
 const choice=(key,allowed,fallback)=>{const value=payload[key]||fallback;if(!allowed.includes(value))fail('Invalid '+key);return value;};
 const integer=(key,fallback,min,max)=>{const value=Number(payload[key]??fallback);if(!Number.isInteger(value)||value<min||value>max)fail('Invalid '+key);return value;};
 const sockets=integer('sockets',1,1,16);if(sockets*cores>128)fail('Total vCPUs cannot exceed 128');
 const balloon=payload.balloon===undefined?undefined:integer('balloon',0,0,memory);
 const bios=choice('bios',['seabios','ovmf'],'seabios'),machine=choice('machine',['pc','q35'],'pc'),vga=choice('vga',['std','virtio','qxl','serial0'],'std');
 const cpu=payload.cpuType===undefined?undefined:choice('cpuType',['x86-64-v2-AES','host','kvm64'],'x86-64-v2-AES');
 const ostype=choice('ostype',['l26','win11','win10','other'],'l26'),scsihw=choice('scsihw',['virtio-scsi-pci','virtio-scsi-single'],'virtio-scsi-pci');
 const cache=payload.diskCache===undefined?undefined:choice('diskCache',['none','writethrough','writeback','directsync'],'none');
 const ioThread=flag(payload.ioThread),discard=payload.discard===undefined?undefined:flag(payload.discard),tpm=flag(payload.tpm);
 if(ioThread&&(diskBus!=='scsi'||scsihw!=='virtio-scsi-single'))fail('IO thread requires VirtIO SCSI Single');
 if(tpm&&bios!=='ovmf')fail('TPM requires UEFI firmware');
 return {properties:{sockets,cpu,balloon,bios,machine,vga,serial0:vga==='serial0'?'socket':undefined,scsihw:diskBus==='scsi'?scsihw:undefined,ostype,agent:flag(payload.qemuAgent,true)?1:0,efidisk0:bios==='ovmf'?`${storage}:1,efitype=4m,pre-enrolled-keys=1`:undefined,tpmstate0:tpm?`${storage}:1,version=v2.0`:undefined},diskOptions:[cache?`cache=${cache}`:null,discard===undefined?null:`discard=${discard?'on':'ignore'}`,ioThread?'iothread=1':null].filter(Boolean)};
}
