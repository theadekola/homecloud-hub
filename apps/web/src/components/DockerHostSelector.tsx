import {useState} from 'react';
import {useApi} from '../hooks';
import {api,setDockerHost} from '../api';
export default function DockerHostSelector(){
 const live=useApi<any>('/docker/hosts',{hosts:[]}),selected=localStorage.getItem('homecloud_docker_host')||'',[busy,setBusy]=useState(false),[error,setError]=useState('');
 const known=live.data.hosts.some((h:any)=>h.id===selected);
 const choose=async(id:string)=>{if(busy)return;setBusy(true);setError('');try{const result=await api(`/docker/hosts/${encodeURIComponent(id||'direct')}/verify`);if(!result.host?.version)throw Error('The selected host did not report a Docker Engine version.');setDockerHost(id);}catch(e:any){setError(e.message||'Docker host verification failed.')}finally{setBusy(false)}};
 return <div className="header-actions"><label>Docker host <select aria-label="Docker host for resource views" disabled={busy} value={selected} onChange={e=>choose(e.target.value)}><option value="" disabled={!live.data.directEnabled}>{live.data.directEnabled?'Direct Engine':'Select a Docker host'}</option>{selected&&!known&&<option value={selected}>Selected host unavailable</option>}{live.data.hosts.map((h:any)=><option key={h.id} value={h.id} disabled={!h.online}>{h.node} / {h.name}{h.online?'':' (offline)'}</option>)}</select></label>{busy&&<small role="status">Verifying Docker host…</small>}{(error||live.error)&&<small role="alert" className="error">{error||live.error}</small>}</div>;
}
