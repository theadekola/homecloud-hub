import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {ConnectionSuccess} from './UI';
import {api,setDockerHost} from '../api';

export default function PairConnector({kind,onPaired,onComplete}:{kind:'proxmox'|'docker';onPaired?:()=>void;onComplete?:()=>void}){
 const navigate=useNavigate(),secure=window.location.protocol==='https:',origin=window.location.origin;
 const [name,setName]=useState(''),[pairing,setPairing]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[connected,setConnected]=useState('');
 const standalone=kind==='docker';
 const command=`curl --fail --show-error --proto '=https' '${origin}/api/${standalone?'docker-agent':'node-agent'}/install' -o /tmp/homecloud-connector-install.sh &&\n${standalone?"if [ \"$(id -u)\" -eq 0 ]; then bash /tmp/homecloud-connector-install.sh; else sudo bash /tmp/homecloud-connector-install.sh; fi":'bash /tmp/homecloud-connector-install.sh'}`;
 const generate=async(e:any)=>{e.preventDefault();setBusy(true);setError('');setMessage('');setPairing(null);try{setPairing(await api('/node-agents/pairing',{method:'POST',body:JSON.stringify({kind,name})}));}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);setMessage('Copied.')}catch{setMessage('Select the text and copy it manually.')}};
 const verify=async()=>{setBusy(true);setError('');setMessage('');try{
  const result=await api('/node-agents/pairing/status',{method:'POST',body:JSON.stringify({code:pairing.code})});
  if(!result.paired)throw Error('Installation has not paired yet. Finish the installer, then retry verification.');
  const inventory=await api('/node-agents'),node=inventory.nodes.find((n:any)=>n.id===result.id);
  if(!node?.online)throw Error('Connector paired but is not online yet. Check its service, then retry.');
  if(standalone){const id=node.id+':node';await api(`/docker/hosts/${encodeURIComponent(id)}/verify`);setConnected(id);}
  else{setConnected(node.id);}
 }catch(e:any){setError(e.message)}finally{setBusy(false)}};
 if(connected)return <ConnectionSuccess message={standalone?'Docker host paired and connection verified successfully.':'Proxmox node paired and connection verified successfully.'} onDone={()=>{onPaired?.();onComplete?.();if(standalone&&!onComplete){setDockerHost(connected);navigate('/docker')}else if(!onComplete){setConnected('');setPairing(null)}}}/>;
 return <div className="node-pairing"><h3>{standalone?'Pair Docker Host':'Pair Proxmox Node'}</h3>
 <p>{standalone?'Run the installer on your Linux Docker server. It connects outward to i-Clusters and uses the local Docker socket. No Docker API port or client certificates are needed.':'Install once on each Proxmox node as root in its Shell. Do not run this node installer inside a VM or CT.'}</p>
 <p className="muted">The connector runs as root and permits authorized Docker management. Use a trusted i-Clusters server. Removing the connection revokes access; uninstall its service separately on the host.</p>
 {!secure&&<p role="alert" className="error">Open i-Clusters at its working HTTPS address before generating a pairing code.</p>}
 <form onSubmit={generate} className="form-grid"><label>Connection name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={100} placeholder={standalone?'Media Server':'Proxmox Node01'}/></label><button className="btn primary" disabled={!secure||busy}>{pairing?'Generate New Code':'Generate Pairing Code'}</button></form>
 {pairing&&<><h4>1. Download and run the installer</h4><pre className="node-command">{command}</pre><button className="btn secondary" onClick={()=>copy(command)}>Copy Installer Command</button>
 <p>Requires Python 3, curl and systemd. {standalone?'Existing Docker is verified first. If Docker is missing on Debian or Ubuntu, the installer asks you to type INSTALL before installing and starting it. Other systems need Docker installed manually.':'The node needs qm and pct.'} No full operating-system upgrade or guest power action is performed.</p>
 <details><summary>i-Clusters uses a private HTTPS certificate?</summary><p>Install the issuing public CA certificate in the host trust store before downloading. For Debian/Ubuntu, save it under /usr/local/share/ca-certificates with a .crt extension and run update-ca-certificates as root. Obtain the certificate from your i-Clusters administrator and verify it. Keep TLS verification enabled.</p></details>
 <h4>2. Enter the i-Clusters address when prompted</h4><pre className="node-command">{origin}</pre><button className="btn secondary" onClick={()=>copy(origin)}>Copy Address</button>
 <h4>3. Enter this one-time code when prompted</h4><pre className="node-command node-pair-code">{pairing.code}</pre><button className="btn secondary" onClick={()=>copy(pairing.code)}>Copy Pairing Code</button><p>Expires {new Date(pairing.expiresAt).toLocaleString()}. This code pairs one {standalone?'Docker host':'Proxmox node'}.</p>
 <h4>4. Verify the connection</h4><pre className="node-command">systemctl status homecloud-node-agent --no-pager</pre><button className="btn primary" disabled={busy||Date.now()>=Date.parse(pairing.expiresAt)} onClick={verify}>{busy?'Verifying…':standalone?'Verify & Connect':'Verify Node'}</button>{!standalone&&<button className="btn secondary" onClick={()=>navigate('/docker')}>Open Docker Hosts</button>}</>}
 {error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}
 </div>;
}
