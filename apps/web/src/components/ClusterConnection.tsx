import { useState } from 'react';
import { Server, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useApi } from '../hooks';
import { Card, Modal } from './UI';

export function ClusterConnection({compact=false,label='Cluster Settings',primary=false}:{compact?:boolean;label?:string;primary?:boolean}) {
 const {data:session}=useApi<any>('/auth/me',null);
 const owner=session?.user?.role==='owner';
 const [copyMessage,setCopyMessage]=useState('');
 const copyCaCommand=async()=>{try{await navigator.clipboard.writeText('cat /etc/pve/pve-root-ca.pem');setCopyMessage('Command copied.');}catch{setCopyMessage('Select and copy the command below.');}};
 const [open,setOpen]=useState(false),[cluster,setCluster]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[nodes,setNodes]=useState<any[]>([]);
 const load=async()=>{setBusy(true);setError('');try{const response:any=await api('/connections/proxmox');setCluster(response.cluster);setNodes([]);setOpen(true);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const submit=async(event:any)=>{
  event.preventDefault();setBusy(true);setError('');setMessage('');setNodes([]);
  const form=event.currentTarget,values=new FormData(form),test=event.nativeEvent.submitter?.value==='test';
  const body={name:values.get('name'),host:values.get('host'),port:Number(values.get('port')),tokenId:values.get('tokenId'),tokenSecret:values.get('tokenSecret'),verifyTls:values.get('verifyTls')==='on',ca:values.get('ca')};
  try{const result:any=await api(`/connections/proxmox${test?'/test':''}`,{method:test?'POST':'PUT',body:JSON.stringify(body)});
   setNodes(result.nodes);setMessage(`${test?'Connection verified':'Cluster saved'}. ${result.nodes.length} node(s) discovered.`);
   if(!test){form.reset();setOpen(false);window.dispatchEvent(new Event('homecloud-connection'));}
  }catch(e:any){setError(e.message);}finally{setBusy(false);}
 };
 if(!owner)return null;
 return <>{compact?<button className={`btn ${primary?'primary':'secondary'}`} disabled={busy} onClick={load}><Server size={15}/>{label}</button>:<Card className="cluster-connection"><div><h3><Server size={20}/> Cluster connection</h3><p>Connect a Proxmox cluster or standalone node. Its nodes and guests load automatically.</p><p className="muted">One active cluster is supported. Saving replaces the current Proxmox connection.</p></div><button className="btn primary" disabled={busy} onClick={load}>Add / Edit Cluster</button></Card>}
 {!open&&error&&<p role="alert" className="login-error">{error}</p>}{!open&&message&&<p role="status">{message}</p>}
 <Modal open={open} title={cluster?'Edit Cluster':'Add Cluster'} onClose={()=>!busy&&setOpen(false)}>
 <div className="cluster-provider"><Server size={22}/> Proxmox VE</div>
 <form className="form-grid cluster-form" onSubmit={submit}>
 <label>Cluster name<input name="name" required maxLength={100} defaultValue={cluster?.name||''} placeholder="Production Cluster"/></label>
 <label>Host<input name="host" required defaultValue={cluster?.host||''} placeholder="proxmox.example.com"/><small>Hostname or IP, without https:// or a port.</small></label>
 <label>Proxmox API port<input name="port" type="number" required min={1} max={65535} defaultValue={cluster?.port||8006}/></label>
 <label>API token ID<input name="tokenId" required defaultValue={cluster?.tokenId||''} placeholder="homecloud@pve!hub"/><small>Use a Proxmox API token with cluster read permissions.</small></label>
 <label className="cluster-wide">API token secret<input name="tokenSecret" type="password" autoComplete="new-password" required placeholder="Enter token secret"/><small>Secrets are never returned to your browser. Re-enter the secret when editing.</small></label>
 <label className="cluster-toggle cluster-wide"><input name="verifyTls" type="checkbox" defaultChecked={cluster?.verifyTls!==false}/><ShieldCheck size={18}/> Verify SSL certificate</label>
 <label className="cluster-wide">Private CA certificate (optional)<textarea name="ca" rows={4} placeholder="-----BEGIN CERTIFICATE-----"/><small>{cluster?.hasCa?'A CA is already saved. Paste it again when saving edits.':'Paste the public PEM CA certificate if your cluster uses a private certificate authority.'}</small></label>
 <details className="cluster-wide cluster-ca-help">
 <summary>How to get your Proxmox CA certificate</summary>
 <ol>
 <li>In Proxmox, select your node, then open <strong>Shell</strong>.</li>
 <li>Run this command on the <strong>Proxmox node</strong>, not the HomeCloud Ubuntu VM:
 <div className="ca-command"><code>cat /etc/pve/pve-root-ca.pem</code><button type="button" className="btn secondary" onClick={copyCaCommand}>Copy command</button></div>
 {copyMessage&&<small role="status">{copyMessage}</small>}</li>
 <li>Copy the entire output, including <code>-----BEGIN CERTIFICATE-----</code> and <code>-----END CERTIFICATE-----</code>.</li>
 <li>Paste it into the <strong>Private CA certificate</strong> field above. Keep <strong>Verify SSL certificate</strong> checked.</li>
 <li>Click <strong>Test Connection</strong>, then <strong>Save &amp; Load Cluster</strong>.</li>
 </ol>
 <p>This applies to the default Proxmox cluster CA. A certificate from a trusted public authority usually needs no CA pasted here. The host must match the certificate's hostname or IP address.</p>
 </details>
 <p className="muted cluster-wide">Connection details are encrypted on the server. A successful test confirms API access; permissions for management actions must also be granted in Proxmox.</p>
 {error&&<p role="alert" className="login-error cluster-wide">{error}</p>}{message&&<p role="status" className="cluster-wide">{message}</p>}
 {!!nodes.length&&<ul className="cluster-wide">{nodes.map(n=><li key={n.name}>{n.name} — {n.status||'Unknown'}</li>)}</ul>}
 <div className="modal-actions cluster-wide"><button className="btn secondary" type="button" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="btn secondary" type="submit" value="test" disabled={busy}>Test Connection</button><button className="btn primary" type="submit" value="save" disabled={busy}>{busy?'Connecting…':'Save & Load Cluster'}</button></div>
 </form></Modal></>;
}
