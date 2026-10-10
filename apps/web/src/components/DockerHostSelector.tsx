import {useApi} from '../hooks';
import {setDockerHost} from '../api';
export default function DockerHostSelector(){
 const live=useApi<any>('/docker/hosts',{hosts:[]}),selected=localStorage.getItem('homecloud_docker_host')||'';
 const known=live.data.hosts.some((h:any)=>h.id===selected);
 return <div className="header-actions"><label>Docker host <select aria-label="Docker host for resource views" value={selected} onChange={e=>setDockerHost(e.target.value)}><option value="">{live.data.directEnabled?'Direct Engine':'Direct Engine (not configured)'}</option>{selected&&!known&&<option value={selected}>Selected host unavailable</option>}{live.data.hosts.map((h:any)=><option key={h.id} value={h.id}>{h.node} / {h.name}{h.online?'':' (offline)'}</option>)}</select></label>{live.error&&<small className="error">{live.error}</small>}</div>;
}
