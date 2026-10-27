import GuestPermissionRepair from './GuestPermissionRepair';
import { useEffect,useRef,useState } from 'react';
import { Server, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useApi } from '../hooks';
import { Card, Modal } from './UI';

export function ClusterConnection({compact=false,label='Cluster Settings',primary=false,autoOpen=false,onSaved,onConnected}:{compact?:boolean;label?:string;primary?:boolean;autoOpen?:boolean;onSaved?:()=>void;onConnected?:()=>void}) {
 const {data:session}=useApi<any>('/auth/me',null);
 const owner=session?.user?.role==='owner';
 const [powerSetup,setPowerSetup]=useState(false),[accessProfile,setAccessProfile]=useState<'power'|'monitor'>('power');
 const [open,setOpen]=useState(false),[cluster,setCluster]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[nodes,setNodes]=useState<any[]>([]),[success,setSuccess]=useState('');
 const close=()=>{if(busy)return;setOpen(false);if(success){setSuccess('');onConnected?.();window.dispatchEvent(new Event('iclusters-connection'));onSaved?.()}};
 const load=async()=>{setBusy(true);setError('');try{const response:any=await api('/connections/proxmox');setCluster(response.cluster);setNodes([]);setMessage('');setSuccess('');setOpen(true);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const autoOpened=useRef(false);
 useEffect(()=>{if(!autoOpen)autoOpened.current=false;if(autoOpen&&owner&&!autoOpened.current){autoOpened.current=true;void load()}},[autoOpen,owner]);
 const submit=async(event:any)=>{
  event.preventDefault();setBusy(true);setError('');setMessage('');setNodes([]);
  const form=event.currentTarget,values=new FormData(form),test=event.nativeEvent.submitter?.value==='test';
  const body={name:values.get('name'),host:values.get('host'),port:Number(values.get('port')),tokenId:values.get('tokenId'),tokenSecret:values.get('tokenSecret'),verifyTls:values.get('verifyTls')==='on',ca:String(values.get('ca')||'').trim()||undefined};
  try{const result:any=await api(`/connections/proxmox${test?'/test':''}`,{method:test?'POST':'PUT',body:JSON.stringify(body)});
   setNodes(result.nodes);setMessage(`${test?'Connection verified':'Cluster saved'}. ${result.nodes.length} node(s) discovered.`);
   if(!test){form.reset();if(accessProfile==='power'){setOpen(false);setMessage('Proxmox connection saved. Complete power permission setup to enable VM and CT start, shutdown and reboot.');setPowerSetup(true)}else setSuccess(`Proxmox connection successful. ${result.nodes.length} node(s) discovered.`);}
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
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
 <label>API token ID<input name="tokenId" required defaultValue={cluster?.tokenId||''} placeholder="iclusters@pve!hub"/><small>Assign PVEAuditor at / with Propagate enabled to the user and, with Privilege Separation, to this token. Power permissions can be configured in the next step.</small></label>
 <label className="cluster-wide">API token secret<input name="tokenSecret" type="password" autoComplete="new-password" required placeholder="Enter token secret"/><small>Secrets are never returned to your browser. Re-enter the secret when editing.</small></label>
 <label className="cluster-wide">Connection access<select aria-label="Proxmox connection access" value={accessProfile} onChange={e=>setAccessProfile(e.target.value as 'power'|'monitor')}><option value="power">Monitoring and VM / CT power management</option><option value="monitor">Monitoring only</option></select><small>Power setup checks the saved token, then lets you grant VM.PowerMgmt to selected VMs and CTs with a Proxmox administrator account. Existing access is preserved; credentials are not saved. New guests can be configured later through Add / Edit Cluster.</small></label>
 <p className="cluster-wide muted">No CA upload is required for the default self-signed certificate connection. HTTPS encrypts traffic; server identity verification is optional under Advanced certificate settings.</p>
 <details className="cluster-wide cluster-ca-help"><summary>Advanced certificate settings (optional)</summary>
 <label className="cluster-toggle"><input name="verifyTls" type="checkbox" defaultChecked={cluster?.verifyTls===true}/><ShieldCheck size={18}/> Verify server certificate</label>
 <p>Enable verification for a trusted public certificate or your private CA. Leaving it off accepts self-signed certificates without checking server identity. This setting also applies during permission setup.</p>
 <label>Private CA certificate (optional)<textarea name="ca" rows={4} placeholder="-----BEGIN CERTIFICATE-----"/><small>{cluster?.hasCa?'A CA is already saved. Leave blank to keep it for the same host and port.':'Only needed with verification enabled if your certificate uses a private CA.'}</small></label>
 </details>
 <details className="cluster-wide cluster-ca-help"><summary>What loads automatically with this token?</summary><p>i-Clusters discovers permitted nodes, VMs, CTs, Proxmox storage, node networks, tasks and services. PVEAuditor at / with Propagate provides cluster read access. Privilege-separated tokens need their own ACL in addition to the user ACL.</p><p>Docker images, volumes, networks and Compose applications inside a VM or CT are guest resources. A cluster read token does not expose them. VM application inventory also requires the QEMU guest agent and permission to execute the fixed inventory command. Complete Docker management requires its Engine connection.</p></details><p className="muted cluster-wide">Connection details are encrypted on the server. A successful test confirms API access; the power management option continues to permission verification after saving.</p>
 {error&&<p role="alert" className="login-error cluster-wide">{error}</p>}{message&&<p role="status" className="cluster-wide">{message}</p>}
 {!!nodes.length&&<ul className="cluster-wide">{nodes.map(n=><li key={n.name}>{n.name} — {n.status||'Unknown'}</li>)}</ul>}
 <div className="modal-actions cluster-wide"><button className="btn secondary" type="button" aria-busy={busy} disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="btn secondary" type="submit" value="test" aria-busy={busy} disabled={busy}>Test Connection</button><button className="btn primary" type="submit" value="save" aria-busy={busy} disabled={busy}>{busy?'Connecting…':accessProfile==='power'?'Save & Set Up Power Access':'Save & Load Cluster'}</button></div>
 </form></Modal>{powerSetup&&<GuestPermissionRepair mode="power" onRepaired={()=>setMessage('Proxmox connection and selected VM / CT power permissions verified.')} onClose={()=>{setPowerSetup(false);onConnected?.();window.dispatchEvent(new Event('iclusters-connection'));onSaved?.()}}/>}</>;
}
