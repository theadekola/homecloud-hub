import {api,confirmedApi} from './api';
/** Never start until both shutdown task and fresh guest status confirm stopped. */
export async function powerCycleGuest(node:string,id:string,kind:'vm'|'lxc',progress:(message:string)=>void,signal:AbortSignal,checkpoint:{startRequested?:boolean}={}){
 const query=(path:string)=>api(path,{signal});
 const wait=()=>new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'))};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},2000);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()});
 const details=`/proxmox/${kind}/${encodeURIComponent(node)}/${encodeURIComponent(id)}/details`;
 const task=async(response:any)=>{const upid=response.result?.task||response.task;if(typeof upid!=='string'||!upid)throw Error('Proxmox did not return a task ID. Inspect this guest before retrying.');const deadline=Date.now()+180000;while(Date.now()<deadline){const state=await query(`/tasks/${encodeURIComponent(node)}/${encodeURIComponent(upid)}`);if(state.status==='stopped'){if(state.exitstatus!=='OK')throw Error(`Proxmox task failed: ${state.exitstatus||'result not reported'}`);return;}await wait()}throw Error('The power task is still pending. Check this guest in Proxmox before retrying.')};
 const state=async(expected:string)=>{const deadline=Date.now()+120000;while(Date.now()<deadline){const report=await query(details);if(report.status?.status===expected)return;await wait()}throw Error(`Guest did not report ${expected}. Check it in Proxmox before retrying.`)};
 const action=async(operation:string)=>{if(signal.aborted)throw new DOMException('Cancelled','AbortError');const response=await confirmedApi(`/actions/proxmox/${kind}/${encodeURIComponent(id)}/${operation}`,{method:'POST',signal,body:JSON.stringify({node})});await task(response)};
 const before=await query(details);if(!['running','stopped'].includes(before.status?.status))throw Error('Guest power state is unavailable. No power action was performed.');
 if(before.status.status==='running'&&!checkpoint.startRequested){progress('Shutting down the guest safely…');await action('shutdown');await state('stopped')}
 if(before.status.status==='stopped'||!checkpoint.startRequested){progress('Starting the guest…');checkpoint.startRequested=true;await action('start');await state('running')}progress('Guest is running. Verifying guest access…');
 if(kind==='vm'){
  const deadline=Date.now()+120000;while(Date.now()<deadline){const report=await query('/connections/proxmox/guests?refresh=1');if(report.guests?.some((g:any)=>g.node===node&&String(g.id)===id&&g.status==='connected'))return;await wait()}
  throw Error('The VM is running, but guest-agent access is not verified yet. Recheck the guest agent.');
 }
}
