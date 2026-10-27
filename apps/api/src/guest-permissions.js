import crypto from 'node:crypto';
import {clusterConfig} from './cluster-config.js';
import {pve,request} from './connectors.js';
const defaultPrivilege='VM.GuestAgent.Unrestricted';
let permissionRepairBusy=false;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const aclSnapshot=rows=>rows.map(r=>JSON.stringify([r.path,r.type,r.ugid,r.roleid,enabled(r.propagate)])).sort();
const enabled=value=>[true,1,'1'].includes(value);
function identity(config){return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');}
function target(config,privilege=defaultPrivilege){
 if(!config?.url||!config.tokenSecret||!/^([^\s=!]+@[^\s=!]+)!([^\s=!]+)$/.test(config.tokenId||''))throw fail('Configure a Proxmox API token first.',409);
 const url=new URL(config.url);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw fail('The saved Proxmox connection must use HTTPS.',409);
 const [user,token]=config.tokenId.split('!');return {endpoint:url.origin,user,token,tokenId:config.tokenId,privilege,trustedTls:config.verifyTls!==false};
}
function permissions(result,path){
 const row=result?.[path];if(!row||typeof row!=='object'||Array.isArray(row))throw fail('Proxmox did not report the effective VM permissions.',502);
 const out={};for(const key of Object.keys(row).sort()){
  if(!/^[A-Za-z][A-Za-z0-9.]*$/.test(key)||![0,1,false,true].includes(row[key]))throw fail('Unexpected Proxmox permission response.',502);
  out[key]=enabled(row[key])?1:0;
 }return out;
}
// Preserve privileges AND their propagation flags when adding a more-specific ACL.
// Otherwise a VM-specific role could replace a read role inherited from / or /vms.
export function permissionRoles(before,privilege=defaultPrivilege){
 const groups=[[],[]];for(const [name,propagate] of Object.entries(before))groups[propagate].push(name);
 groups[0].push(privilege);
 return groups.map((privs,propagate)=>({privs:[...new Set(privs)].sort(),propagate})).filter(row=>row.privs.length).map(row=>({...row,roleid:'HCGD_'+crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0,20)}));
}
export function createGuestPermissionRepair({config=clusterConfig,query=pve,transport=request,privilege=defaultPrivilege,resourceTypes=['qemu']}={}){
 const bind=c=>identity({connection:c,privilege,resourceTypes});
 const visible=async c=>{const rows=await query('/cluster/resources?type=vm',{},c);if(!Array.isArray(rows))throw fail('Proxmox VM inventory is unavailable.',502);return rows.filter(r=>resourceTypes.includes(r.type)&&Number.isSafeInteger(Number(r.vmid))&&r.node).map(r=>({id:String(r.vmid),name:r.name||String(r.vmid),node:r.node,status:r.status,kind:r.type==='lxc'?'CT':'VM'}));};
 return {
  async inspect(){
   const c=config(),connection=target(c,privilege),binding=bind(c),guests=await visible(c),checked=[];
   for(let i=0;i<guests.length;i+=4)checked.push(...await Promise.all(guests.slice(i,i+4).map(async guest=>{
    try{const path='/vms/'+guest.id,current=permissions(await query('/access/permissions?'+new URLSearchParams({path}),{},c),path);return {...guest,verified:Object.hasOwn(current,privilege)};}
    catch{return {...guest,verified:false,permissionError:'Current guest access could not be verified. Recheck this VM.'};}
   })));
   if(bind(config())!==binding)throw fail('The Proxmox connection changed. Reopen the repair window.',409);
   return {...connection,connectionId:binding,guests:checked.filter(g=>!g.verified),verifiedCount:checked.filter(g=>g.verified).length,totalCount:checked.length};
  },
  async repair(input){
   if(permissionRepairBusy)throw fail('A guest permission repair is already running.',409);
   const c=config(),connection=target(c,privilege),binding=bind(c);
   if(input?.connectionId!==binding)throw fail('The Proxmox connection changed. Reopen the repair window.',409);
   if(!connection.trustedTls)throw fail('Enable TLS verification and configure the trusted Proxmox CA before entering administrator credentials.',409);
   if(input?.confirm!==true)throw fail(privilege==='VM.PowerMgmt'?'Confirm power management access for the selected VMs and CTs.':'Confirm guest command access for the selected VMs.');
   if(!Array.isArray(input.vmids)||!input.vmids.length||input.vmids.length>20||input.vmids.some(id=>!/^\d+$/.test(String(id))))throw fail('Select between 1 and 20 virtual machines.');
   const ids=[...new Set(input.vmids.map(String))];
   if(typeof input.username!=='string'||!/^\S+@[^\s!]+$/.test(input.username)||input.username.length>128||typeof input.password!=='string'||!input.password||input.password.length>2048||/[\r\n\0]/.test(input.password)||input.otp&&(!/^\d{6,8}$/.test(input.otp)))throw fail('Enter a Proxmox administrator username including its realm, password, and optional numeric OTP.');
   permissionRepairBusy=true;let ticket='',csrf='',changed=false;
   const tls={rejectUnauthorized:true,...(c.ca?{ca:c.ca}:{})};
   const bound=()=>{if(bind(config())!==binding)throw fail('The Proxmox connection changed. Reopen the repair window.',409);};
   const admin=async(path,method='GET',body)=>{
    bound();const res=await transport(connection.endpoint+'/api2/json'+path,{method,timeoutMs:15000,headers:{...(ticket?{Cookie:'PVEAuthCookie='+encodeURIComponent(ticket),CSRFPreventionToken:csrf}:{}),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body).toString()}:{})},tls);
    if(!res.ok)throw fail(res.status===401?'Proxmox administrator authentication failed or expired.':res.status===403?'The Proxmox administrator account cannot manage these permissions.':`Proxmox permission request failed (HTTP ${res.status}).`,res.status===401||res.status===403?403:502);
    let result;try{result=await res.json();}catch{throw fail('Proxmox returned an invalid permission response.',502);}if(!Object.hasOwn(result,'data'))throw fail('Proxmox returned an invalid permission response.',502);return result.data;
   };
   try{
    const guests=await visible(c);if(ids.some(id=>!guests.some(g=>g.id===id)))throw fail('A selected VM is no longer visible on the configured cluster.',409);
    const login=await admin('/access/ticket','POST',{username:input.username,password:input.password,...(input.otp?{otp:input.otp}:{})});input.password='';input.otp='';
    if(login?.NeedTFA||!login?.ticket||login.ticket.startsWith('PVE:tfa!')||!login.CSRFPreventionToken)throw fail('Complete Proxmox authentication with a supported password and OTP account.',403);
    ticket=login.ticket;csrf=login.CSRFPreventionToken;
    const access=permissions(await admin('/access/permissions?path=%2Faccess'),'/access');if(['Sys.Modify','Sys.Audit','Permissions.Modify'].some(p=>!Object.hasOwn(access,p)))throw fail('Use a Proxmox administrator with Sys.Modify, Sys.Audit and Permissions.Modify on /access.',403);
    const version=await admin('/version');if(Number.parseInt(version?.version,10)<9||!/^\d+/.test(version?.version||''))throw fail('Automatic permission repair requires Proxmox VE 9 or newer.',409);
    const token=await admin(`/access/users/${encodeURIComponent(connection.user)}/token/${encodeURIComponent(connection.token)}`);
    if(![0,1,true,false,'0','1'].includes(token?.privsep))throw fail('Proxmox did not report the token privilege-separation setting.',502);
    const subjects=[{id:connection.user,key:'users'},...(enabled(token.privsep)?[{id:connection.tokenId,key:'tokens'}]:[])];
    const acl=await admin('/access/acl'),roleList=await admin('/access/roles');if(!Array.isArray(acl)||!Array.isArray(roleList))throw fail('Proxmox permission inventory is incomplete.',502);
    const roleMap=new Map(roleList.map(r=>[r.roleid,r])),plans=[];
    for(const id of ids){const path='/vms/'+id;for(const subject of subjects){
     const before=permissions(await admin('/access/permissions?'+new URLSearchParams({userid:subject.id,path})),path);
     if(Object.hasOwn(before,privilege))continue;
     if(acl.some(a=>a.roleid==='NoAccess'&&a.ugid===subject.id&&(a.path===path||enabled(a.propagate)&&path.startsWith(a.path==='/'?'/':a.path+'/'))))throw fail(`VM ${id} has an explicit NoAccess rule. Review it in Proxmox before granting discovery access.`,409);
     const roles=permissionRoles(before,privilege);
     for(const role of roles){const existing=roleMap.get(role.roleid);if(existing){const detail=await admin('/access/roles/'+role.roleid);const actual=Object.keys(detail||{}).sort();if(!same(actual,role.privs))throw fail('A managed discovery role has conflicting privileges. Review it in Proxmox.',409);}}
     plans.push({path,subject,before,roles});
    }}
    // Finish every read and collision check before changing any permissions.
    const fresh=await admin('/access/acl');if(!Array.isArray(fresh)||!same(aclSnapshot(fresh),aclSnapshot(acl)))throw fail('Proxmox permissions changed during inspection. Retry the repair.',409);
    for(const plan of plans){const current=permissions(await admin('/access/permissions?'+new URLSearchParams({userid:plan.subject.id,path:plan.path})),plan.path);
     // The user grant can expose an existing privilege on a separated token.
     const comparable={...current};if(plan.subject.key==='tokens')delete comparable[privilege];
     if(!same(comparable,plan.before))throw fail('Effective permissions changed during repair. Recheck before retrying.',409);
     if(Object.hasOwn(current,privilege))continue;
     for(const role of plan.roles){
      if(!roleMap.has(role.roleid)){await admin('/access/roles','POST',{roleid:role.roleid,privs:role.privs.join(' ')});changed=true;roleMap.set(role.roleid,role);}
      await admin('/access/acl','PUT',{path:plan.path,roles:role.roleid,[plan.subject.key]:plan.subject.id,propagate:String(role.propagate)});changed=true;
     }
    }
    for(const id of ids){const path='/vms/'+id,after=permissions(await query('/access/permissions?'+new URLSearchParams({path}),{},c),path);
     if(!Object.hasOwn(after,privilege))throw fail(`VM ${id} still lacks effective guest command access. Review its ACLs in Proxmox.`,422);
     for(const plan of plans.filter(p=>p.path===path&&p.subject.key==='tokens'))if(Object.keys(plan.before).some(key=>!Object.hasOwn(after,key)))throw fail(`VM ${id} did not preserve its existing token permissions. Review its ACLs in Proxmox.`,422);
    }
    return {ok:true,verified:true,vmids:ids,changed,message:privilege==='VM.PowerMgmt'?'Power management permissions verified for the selected VMs and CTs.':'Guest discovery permissions verified for the selected VMs.'};
   }catch(error){const message=error?.status?error.message:'Could not reach or verify the configured Proxmox server. Check TLS trust and connectivity.';throw fail(message+(changed?' Some permissions were applied before this error. Recheck before retrying.':''),error?.status||502);
   }finally{ticket='';csrf='';input.password='';input.otp='';permissionRepairBusy=false;}
  }
 };
}
export const guestPermissionRepair=createGuestPermissionRepair();

export const powerPermissionSetup=createGuestPermissionRepair({privilege:'VM.PowerMgmt',resourceTypes:['qemu','lxc']});
