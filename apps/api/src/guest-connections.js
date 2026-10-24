import {pve} from './connectors.js';
// Read checks only. A failed agent probe does not distinguish a missing package from a stopped service.
export async function guestConnections(query=pve){
 const resources=await query('/cluster/resources?type=vm',{timeoutMs:10000});
 if(!Array.isArray(resources))throw Object.assign(new Error('Proxmox guest inventory is unavailable'),{status:502});
 const guests=resources.filter(r=>r.type==='qemu').map(r=>({id:String(r.vmid),node:r.node,name:r.name||String(r.vmid),power:r.status}));
 const rows=[];
 for(let i=0;i<guests.length;i+=4)await Promise.all(guests.slice(i,i+4).map(async guest=>{
  const base=`/nodes/${encodeURIComponent(guest.node)}/qemu/${encodeURIComponent(guest.id)}`;
  let status='unverified',detail='';
  try{
   if(guest.power!=='running'&&guest.power!=='stopped'){
    rows.push({...guest,status:'power_unknown',detail:'VM power state is not confirmed as running or stopped. Verify the VM and its node in Proxmox before changing guest-agent setup.'});return;
   }
   const config=await query(base+'/config',{timeoutMs:4000});
   const enabled=/(?:^|,)(?:1|enabled=1)(?:,|$)/.test(String(config.agent||''));
   if(guest.power==='stopped'){status='stopped';detail='Start this VM in Proxmox before checking or installing its guest agent.';}
   else if(!enabled){status='disabled';detail='Guest-agent access is disabled in this VM’s Proxmox options.';}
   else{const info=await query(base+'/agent/get-osinfo',{timeoutMs:4000}),os=info?.result||info;if(!os||typeof os!=='object'||Array.isArray(os)||!Object.keys(os).length)throw Error('Guest OS information was not returned');status='connected';detail=os.name||os.id||'QEMU Guest Agent responded.';}
  }catch(error){const code=error.providerStatus||Number(error.message?.match(/HTTP (\d+)/)?.[1]);status=code===401||code===403?'permission':'unavailable';detail=status==='permission'?'The configured Proxmox account or token cannot check this VM’s guest access.':'The guest agent could not be verified. It may be missing, stopped or awaiting a full shutdown and start.';}
  rows.push({...guest,status,detail});
 }));
 return {guests:rows.sort((a,b)=>a.node.localeCompare(b.node)||Number(a.id)-Number(b.id)),checkedAt:new Date().toISOString()};
}

// Keep multi-VM network probes off the page's response path. The client polls while refreshing.
export function createGuestConnectionReader({config=()=>({url:'injected'}),query=pve,now=Date.now}={}){
 let generation=0,key='',pending=null,checked=0,result={guests:[],refreshing:false};
 return function read(force=false){
  const connection=config(),identity=JSON.stringify(connection);
  if(identity!==key){key=identity;generation++;pending=null;checked=0;result={guests:[],refreshing:false};}
  if(!connection?.url)return {guests:[],refreshing:false,configured:false};
  if(!pending&&(force||!checked||now()-checked>30000)){
   const started=generation;result={...result,refreshing:true,error:undefined};
   pending=guestConnections((path,init)=>query(path,init,connection)).then(data=>{if(generation===started)result={...data,refreshing:false}}).catch(()=>{if(generation===started)result={guests:[],refreshing:false,error:'VM guest checks could not complete. Recheck the Proxmox connection and try again.'}}).finally(()=>{if(generation===started){checked=now();pending=null}});
  }
  return result;
 };
}
