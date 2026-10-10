import {useState} from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip} from 'recharts';
import {Card,Badge} from './UI';
export default function DockerMonitoring({data}:{data:any}){
 const hosts=data.dockerFleet?.hosts||[],[selected,setSelected]=useState('all');
 const ids=[...new Set((data.metrics||[]).flatMap((m:any)=>(m.docker||[]).map((c:any)=>c.hostId)))];
 const history=(data.metrics||[]).slice(-240).map((m:any)=>{
  const rows=(m.docker||[]).filter((c:any)=>(selected==='all'||c.hostId===selected)&&c.status==='running');
  return {time:m.time,cpu:rows.length&&rows.every((c:any)=>typeof c.cpu==='number')?rows.reduce((total:number,c:any)=>total+c.cpu,0):null};
 });
 return <Card><h3>Docker Host Monitoring</h3><p className="muted">Paired hosts are sampled independently. Unavailable hosts retain their alerts until a successful measurement clears them.</p><div className="table-wrap"><table><thead><tr><th>Node / host</th><th>Status</th><th>Containers</th><th>Last measurement</th></tr></thead><tbody>{hosts.map((h:any)=><tr key={h.id}><td>{h.node} / {h.name}</td><td><Badge tone={h.status==='reachable'?'green':h.status==='partial'?'yellow':'red'}>{h.status}</Badge>{h.error&&<small>{h.error}</small>}</td><td>{h.inventory?.containers?.length??'Unavailable'}</td><td>{new Date(h.sampledAt).toLocaleString()}</td></tr>)}</tbody></table></div>{!hosts.length&&<p>No paired Docker hosts reported. Pair nodes on the Docker page.</p>}<label>CPU history <select value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">All reporting Engines</option>{ids.map((id:any)=><option key={id} value={id}>{id==='direct'?'Direct Engine':hosts.find((h:any)=>h.id===id)?.name||id}</option>)}</select></label><p className="muted">Sum of running-container CPU percentages, up to the latest 240 samples. Totals can exceed 100% on multicore hosts. Missing measurements appear as gaps.</p>{history.some((h:any)=>h.cpu!=null)?<ResponsiveContainer width="100%" height={220}><LineChart data={history}><XAxis dataKey="time" tickFormatter={v=>new Date(v).toLocaleTimeString()}/><YAxis/><Tooltip/><Line name="Container CPU %" dataKey="cpu" stroke="#3b82f6" dot={false} connectNulls={false}/></LineChart></ResponsiveContainer>:<p>No container CPU measurements collected yet.</p>}</Card>;
}
