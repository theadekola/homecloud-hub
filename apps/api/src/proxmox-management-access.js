import {pve} from './connectors.js';
const clusterPrivileges=['Sys.Audit','VM.Audit','VM.Allocate','VM.PowerMgmt','VM.Config.CPU','VM.Config.Memory','VM.Config.Disk','VM.Config.Network','VM.Config.Options','Datastore.Audit','Datastore.AllocateSpace'];
const guestPrivileges=clusterPrivileges.filter(name=>name.startsWith('VM.')&&name!=='VM.Allocate');
const failure=(message,status=403)=>Object.assign(Error(message),{status,managementAccess:true});
const guide='In Proxmox Datacenter → Permissions, assign PVEAdmin at / with Propagate enabled to both the user and its privilege-separated API token, then retry Save.';

/** Read effective token permissions before committing the candidate connection. */
export async function verifyProxmoxManagement(config,resources,query=pve){
 const check=async(path,required,propagate=false)=>{
  let result;try{result=await query('/access/permissions?'+new URLSearchParams({path}),{},config)}catch{throw failure('Could not verify Proxmox management access. '+guide,502)}
  const row=result?.[path];
  if(!row||typeof row!=='object'||Array.isArray(row))throw failure('Proxmox returned an incomplete permission report. '+guide,502);
  // Values describe propagation, not whether the privilege itself is granted.
  const missing=required.filter(key=>!Object.hasOwn(row,key)||![0,1,false,true].includes(row[key])||propagate&&![1,true].includes(row[key]));
  if(missing.length)throw failure(`Proxmox management access is incomplete at ${path}: ${missing.join(', ')}. ${guide}`);
 };
 await check('/',clusterPrivileges,true);
 const targets=resources.flatMap(row=>row.type==='node'&&row.node?[{path:'/nodes/'+row.node,privileges:['Sys.Audit']}]:['qemu','lxc'].includes(row.type)&&Number.isSafeInteger(Number(row.vmid))?[{path:'/vms/'+row.vmid,privileges:guestPrivileges}]:[]);
 for(let i=0;i<targets.length;i+=8)await Promise.all(targets.slice(i,i+8).map(target=>check(target.path,target.privileges)));
 return {verified:true,power:true,configuration:true,nodeCount:resources.filter(r=>r.type==='node').length,guestCount:targets.filter(t=>t.path.startsWith('/vms/')).length};
}
