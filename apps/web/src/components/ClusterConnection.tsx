import { useEffect,useRef,useState } from 'react';
import { Server,ChevronDown } from 'lucide-react';
import { api } from '../api';
import { useApi } from '../hooks';
import { Card, Modal } from './UI';

export function ClusterConnection({compact=false,label='Cluster Settings',primary=false,autoOpen=false,onSaved,onConnected}:{compact?:boolean;label?:string;primary?:boolean;autoOpen?:boolean;onSaved?:()=>void;onConnected?:()=>void}) {
 const {data:session}=useApi<any>('/auth/me',null);
 const owner=session?.user?.role==='owner';
 const [open,setOpen]=useState(false),[cluster,setCluster]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[nodes,setNodes]=useState<any[]>([]),[success,setSuccess]=useState('');
 const close=()=>{if(busy)return;setOpen(false);if(success){setSuccess('');onConnected?.();window.dispatchEvent(new Event('iclusters-connection'));onSaved?.()}};
 const load=async()=>{setBusy(true);setError('');try{const response:any=await api('/connections/proxmox');setCluster(response.cluster);setNodes([]);setMessage('');setSuccess('');setOpen(true);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const autoOpened=useRef(false);
 useEffect(()=>{if(!autoOpen)autoOpened.current=false;if(autoOpen&&owner&&!autoOpened.current){autoOpened.current=true;void load()}},[autoOpen,owner]);
 const submitting=useRef(false);
 const submit=async(event:any)=>{
  event.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setError('');setMessage('');setNodes([]);
  const form=event.currentTarget,values=new FormData(form),test=event.nativeEvent.submitter?.value==='test';
  const body={name:values.get('name'),host:values.get('host'),port:Number(values.get('port')),tokenId:values.get('tokenId'),tokenSecret:values.get('tokenSecret'),verifyTls:cluster?.verifyTls===true,management:true};
  try{const result:any=await api(`/connections/proxmox${test?'/test':''}`,{method:test?'POST':'PUT',body:JSON.stringify(body)});
   if(result.management?.verified!==true)throw Error('Proxmox management access was not confirmed. Check both PVEAdmin permission entries and retry.');
   setNodes(result.nodes);setMessage(`${test?'Connection verified':'Cluster saved'}. ${result.nodes.length} node(s) discovered.`);
   if(!test){form.reset();setSuccess(`Proxmox connection successful. ${result.nodes.length} node(s) discovered. VM / CT power and configuration access verified.`);}
  }catch(e:any){setError(e.message);}finally{submitting.current=false;setBusy(false);}
 };
 if(!owner)return null;
 return <>{compact?<button className={`btn ${primary?'primary':'secondary'}`} aria-busy={busy} disabled={busy} onClick={load}><Server size={15}/>{label}</button>:<Card className="cluster-connection"><div><h3><Server size={20}/> Cluster connection</h3><p>Connect a Proxmox cluster or standalone node. Its nodes and guests load automatically.</p><p className="muted">One active cluster is supported. Saving replaces the current Proxmox connection.</p></div><button className="btn primary" aria-busy={busy} disabled={busy} onClick={load}>Add / Edit Cluster</button></Card>}
 {!open&&error&&<p role="alert" className="login-error">{error}</p>}{!open&&message&&<p role="status">{message}</p>}
 <Modal open={open} title={cluster?'Edit Cluster':'Add Cluster'} onClose={close} success={success}>
 <div className="cluster-provider"><Server size={22}/> Proxmox VE</div>
 <form className="form-grid cluster-form" onSubmit={submit}>
 <label>Cluster name<input name="name" required maxLength={100} defaultValue={cluster?.name||''} placeholder="Production Cluster"/></label>
 <label>Host<input name="host" required defaultValue={cluster?.host||''} placeholder="proxmox.example.com"/><small>Hostname or IP, without https:// or a port.</small></label>
 <label>Proxmox API port<input name="port" type="number" required min={1} max={65535} defaultValue={cluster?.port||8006}/></label>
 <label>API token ID<input name="tokenId" required defaultValue={cluster?.tokenId||''} placeholder="iclusters@pve!hub"/><small>Use the full ID, for example iclusters@pve!hub. Assign PVEAdmin at / with Propagate to both the user and API token.</small></label>
 <label className="cluster-wide">API token secret<input name="tokenSecret" type="password" autoComplete="new-password" required placeholder="Enter token secret"/><small>Secrets are never returned to your browser. Re-enter the secret when editing.</small></label>
 <details className="cluster-wide cluster-setup-guide" aria-label="Proxmox user and token setup">
 <summary>Create your Proxmox user and API token<ChevronDown size={20} aria-hidden="true"/></summary>
 <ol>
 <li>Sign in to Proxmox as an administrator. Open <strong>Datacenter → Permissions → Users → Add</strong>. Create an enabled user such as <code>iclusters</code> in <strong>Proxmox VE authentication server (pve)</strong>.</li>
 <li>Open <strong>Datacenter → Permissions → Add → User Permission</strong>. Set Path to <code>/</code>, User to <code>iclusters@pve</code>, Role to <strong>PVEAdmin</strong>, and enable <strong>Propagate</strong>.</li>
 <li>Open <strong>Datacenter → Permissions → API Tokens → Add</strong>. Select that user, enter a Token ID such as <code>hub</code>, and leave <strong>Privilege Separation</strong> enabled. Use an unexpired token. Copy the full Token ID and secret immediately. The secret is shown only once.</li>
 <li>Open <strong>Datacenter → Permissions → Add → API Token Permission</strong>. Set Path to <code>/</code>, API Token to <code>iclusters@pve!hub</code>, Role to <strong>PVEAdmin</strong>, and enable <strong>Propagate</strong>.</li>
 <li>Enter your Proxmox host, API port (normally <code>8006</code>), full Token ID and secret above. Click <strong>Save</strong>. i-Clusters verifies management access and loads the cluster, nodes, VMs and CTs in one step.</li>
 </ol>
 <p>These are two PVEAdmin permission entries for one user and one token. They enable VM / CT power and configuration. PVEAdmin does not grant Proxmox permission administration or node shutdown.</p>
 <p>Guest OS details require the QEMU Guest Agent. Connect Docker hosts separately for Docker management. Your @pve account is not a Linux SSH account.</p>
 <a href="https://pve.proxmox.com/pve-docs/pveum.1.html" target="_blank" rel="noopener noreferrer">Proxmox user and API token documentation</a>
 </details>
 <p className="muted cluster-wide">New connections accept self-signed Proxmox HTTPS certificates. Existing certificate-verification settings are retained when editing. Connection details are encrypted on the server.</p>
 {error&&<p role="alert" className="login-error cluster-wide">{error}</p>}{message&&<p role="status" className="cluster-wide">{message}</p>}
 {!!nodes.length&&<ul className="cluster-wide">{nodes.map(n=><li key={n.name}>{n.name} — {n.status||'Unknown'}</li>)}</ul>}
 <div className="modal-actions cluster-wide"><button className="btn secondary" type="button" aria-busy={busy} disabled={busy} onClick={close}>Cancel</button><button className="btn secondary" type="submit" value="test" aria-busy={busy} disabled={busy}>Test Connection</button><button className="btn primary" type="submit" value="save" aria-busy={busy} disabled={busy}>{busy?'Connecting…':'Save'}</button></div>
 </form></Modal></>;
}
