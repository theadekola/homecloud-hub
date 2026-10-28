import RefreshButton from '../components/RefreshButton';
import {cardValue} from '../components/ReportLoading';
import DistributionSummary from '../components/DistributionSummary';
import {proxmoxAvailability} from '../proxmox-availability';
import ReportLoading from '../components/ReportLoading';
import {reportValue} from '../components/ReportLoading';
import BrandIcon from '../components/BrandIcon';


import ProxmoxTasks from './ProxmoxTasks';
import {useEffect,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {Server,Monitor,Box,Cpu,MemoryStick,HardDrive,ShieldCheck,RefreshCw,Plus,Terminal,Archive,ListChecks,ExternalLink} from 'lucide-react';
import {AreaChart,Area,ResponsiveContainer,PieChart,Pie,Cell,Tooltip} from 'recharts';
import {useApi,refreshResources} from '../hooks';
import {taskState,inventoryComplete} from '../proxmox-state';
import {api} from '../api';

import {Card,Badge} from '../components/UI';
import {DataTable} from '../components/DataTable';
import ClusterNodes from './ClusterNodes';
import VirtualMachines from './VirtualMachines';
import LxcContainers from './LxcContainers';
import ProxmoxStorage from './ProxmoxStorage';
import ProxmoxNetworks from './ProxmoxNetworks';
const tabs=['Overview','Nodes','Virtual Machines','LXC Containers','Storage','Networks','Tasks & Logs'];
const bytes=(v:any)=>v==null?'Unknown':Number(v)>=1024**4?`${(v/1024**4).toFixed(1)} TiB`:`${(v/1024**3).toFixed(1)} GiB`;
const pct=(v:any)=>v==null?'Unknown':`${v}%`;
const duration=(v:any)=>v==null?'Unknown':`${Math.floor(v/86400)}d ${Math.floor(v%86400/3600)}h ${Math.floor(v%3600/60)}m`;
const sum=(rows:any[],key:string)=>rows.length&&rows.every(r=>typeof r[key]==='number')?rows.reduce((n,r)=>n+r[key],0):null;
const colors=['#3b82f6','#8b5cf6','#22c55e','#f59e0b','#14b8a6'];
export default function ProxmoxOverview(){
 const [hours,setHours]=useState('24');
 const live=useApi<any>('/proxmox',null),tasks=useApi<any>(`/proxmox/tasks?hours=${hours}`,null),history=useApi<any>('/dashboard',null),network=useApi<any>('/network',null),session=useApi<any>('/auth/me',null);
 const [busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[refreshFailure,setRefreshFailure]=useState(''),[taskResult,setTaskResult]=useState<any>(null);
 const [params,setParams]=useSearchParams(),navigate=useNavigate();
 const requested=params.get('tab')||'',action=params.get('action');
 const view=action==='Create VM'?'Virtual Machines':action==='Create CT'?'LXC Containers':tabs.includes(requested)?requested:'Overview';
 const setView=(tab:string)=>{if(!tabs.includes(tab))return;const next=new URLSearchParams(params);next.set('tab',tab);next.delete('action');if(tab!=='Nodes'){next.delete('node');next.delete('nodeTab');}setParams(next);};
 const openNodeServices=(name:string)=>{const next=new URLSearchParams(params);next.set('tab','Nodes');next.set('node',name);next.set('nodeTab','Services');next.delete('action');setParams(next);};
 const data=live.error?null:live.data,nodes=data?.nodes||[],vms=data?.vms||[],lxc=data?.lxc||[],storage=data?.storage||[],errors=data?.errors||[],services=data?.nodeServices||[];
 const cluster=data?.clusterStatus?.find((r:any)=>r.type==='cluster'),online=nodes.filter((n:any)=>n.status==='online').length;
 const available=proxmoxAvailability(data),totalCores=available.cores,usedMemory=available.usedMemory,totalMemory=available.totalMemory,totalStorage=available.totalStorage,usedStorage=available.usedStorage,cpuUsed=available.cpuUsed;
 const counted=!live.error&&(data?.resourceInventoryComplete===true||inventoryComplete(data,live.error));
 const health=live.error||refreshFailure||!data||!nodes.length?'Unknown':errors.length?'Limited access':nodes.some((n:any)=>n.status!=='online')||cluster?.quorate===0||cluster?.quorate===false?'Needs attention':'Online';
 const recent=(tasks.data?.tasks||[]).filter((t:any)=>t.starttime>=Date.now()/1000-Number(hours)*3600).sort((a:any,b:any)=>b.starttime-a.starttime);
 const permissionErrors=errors.some((e:string)=>e.includes('403'));
 const create=(kind:string)=>{const next=new URLSearchParams(params);next.set('tab',kind==='Create VM'?'Virtual Machines':'LXC Containers');next.set('action',kind);next.delete('node');next.delete('nodeTab');setParams(next);};
 const operator=['operator','admin','owner'].includes(session.data?.user?.role);
 const refresh=async()=>{setBusy(true);setFailure('');setRefreshFailure('');try{live.setData(await api('/proxmox?refresh=1'));}catch(e:any){setFailure(e.message);setRefreshFailure(e.message);}finally{await refreshResources(['/proxmox','/dashboard','/network','/backups','/settings']);setBusy(false);}};
 const inspectTask=async(t:any,log=false)=>{setFailure('');try{setTaskResult(await api(`/tasks/${encodeURIComponent(t.node)}/${encodeURIComponent(t.upid)}${log?'/log':''}`));}catch(e:any){setFailure(e.message);}};
 const nodeTable=(rows:any[])=><DataTable rows={rows} columns={[{key:'name',label:'Node name',render:(r:any)=><span className="pve-node-name"><Server size={21}/><span><b>{r.name}</b><small>{r.ip||'IP not reported'}</small></span></span>},{key:'status',label:'Status',render:(r:any)=><Badge tone={r.status==='online'?'green':'red'}>{r.status||'Unknown'}</Badge>},{key:'cpu',label:'CPU usage',render:(r:any)=><div className="pve-measure"><span>{pct(r.cpu)}</span><Spark rows={history.data?.metrics||[]} node={r.name} metric="cpu" hours={hours} color="#3b82f6"/></div>},{key:'memoryPercent',label:'Memory usage',render:(r:any)=><div className="pve-measure"><span>{pct(r.memoryPercent)}</span><Spark rows={history.data?.metrics||[]} node={r.name} metric="memory" hours={hours} color="#a855f7"/></div>},{key:'uptime',label:'Uptime',render:(r:any)=>duration(r.uptime)},{key:'inspect',label:'Details',render:(r:any)=> <button className="btn ghost" onClick={()=>openNodeServices(r.name)}>Services</button>}]}/>;
 const taskTable=(rows:any[])=><DataTable rows={rows} columns={[{key:'upid',label:'Task ID',render:(r:any)=><button title={r.upid} className="pve-text-button" onClick={()=>inspectTask(r)}>{r.upid?.slice(0,27)}…</button>},{key:'node',label:'Node'},{key:'type',label:'Type'},{key:'id',label:'Guest ID'},{key:'status',label:'Status',render:(r:any)=><Badge tone={taskState(r)==='Completed'?'green':taskState(r)==='Failed'?'red':taskState(r)==='Running'?'blue':'gray'}>{taskState(r)}</Badge>},{key:'starttime',label:'Start time',render:(r:any)=>new Date(r.starttime*1000).toLocaleString()},{key:'duration',label:'Duration',render:(r:any)=>r.endtime?`${r.endtime-r.starttime}s`:'In progress'},{key:'logs',label:'Logs',render:(r:any)=><button className="btn ghost" onClick={()=>inspectTask(r,true)}>View log</button>}]}/>;
 const navigation=<div className="pve-tabbar"><div role="tablist" aria-label="Proxmox sections">{tabs.map(t=><button key={t} role="tab" aria-selected={view===t} onClick={()=>setView(t)}>{t}</button>)}</div><select aria-label="Task history period" value={hours} onChange={e=>setHours(e.target.value)}><option value="1">Last hour</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option></select><RefreshButton aria-label="Refresh Proxmox" className="btn secondary" aria-busy={busy} disabled={busy} onClick={refresh}><RefreshCw size={15}/></RefreshButton></div>;
 return <div className="pve-page">
 <div className="pve-heading"><div><h1><BrandIcon brand="proxmox" size={28}/><span className="provider-title">Proxmox Cluster: {data?.cluster?.name||'Not connected'}</span> <Badge tone={health==='Online'?'green':health==='Unknown'?'gray':'yellow'}>{health}</Badge></h1><p>Manage your nodes, virtual machines and containers.</p></div><div className="pve-heading-actions"><a className="btn secondary" href="https://pve.proxmox.com/pve-docs/" target="_blank" rel="noreferrer">Documentation <ExternalLink size={13}/></a>{session.data?.user?.role==='owner'&&<Link className="btn secondary" to="/settings?tab=Connections">Manage Connections</Link>}{operator&&<><button className="btn primary" onClick={()=>create('Create VM')}><Plus size={15}/> Create VM</button><button className="btn secondary" onClick={()=>create('Create CT')}><Box size={15}/> Create CT</button></>}</div></div>

 {(live.error||failure)&&<p className="login-error" role="alert">{failure||live.error}</p>}
 {!!errors.length&&<details className="pve-errors"><summary>{errors.length} unavailable API readings{permissionErrors?' — Proxmox permissions need attention':''}</summary>{permissionErrors&&<p>In Proxmox → Datacenter → Permissions, grant PVEAuditor at / with Propagate enabled to both the user and its privilege-separated API token. This provides read access. Management actions require their own additional privileges.</p>}<ul>{errors.map((e:string)=><li key={e}>{e}</li>)}</ul></details>}
 {view==='Overview'?<><div className="pve-stats metric-grid">{[
 ['Total Nodes',counted?nodes.length:'Unknown',`${online} Online`,Server,'Nodes'],['Total VMs',counted?vms.length:'Unknown',`${vms.filter((v:any)=>v.status==='running').length} Running`,Monitor,'Virtual Machines'],['Total LXC',counted?lxc.length:'Unknown',`${lxc.filter((v:any)=>v.status==='running').length} Running`,Box,'LXC Containers'],[available.partial?'Available CPU':'Total CPU',cpuUsed==null?'Unknown':cpuUsed.toFixed(1),totalCores==null?'Core capacity unknown':`of ${totalCores} cores in use`,Cpu,'Nodes'],[available.partial?'Available Memory':'Total Memory',bytes(usedMemory),`of ${bytes(totalMemory)}`,MemoryStick,'Nodes'],[available.partial?'Available Storage':'Total Storage',bytes(usedStorage),'Per-node entries; shared pools may repeat',HardDrive,'Storage']
 ].map(([label,value,sub,Icon,target]:any)=><button className="pve-stat" key={label} onClick={()=>setView(target)}><div><small>{label}</small><strong>{cardValue(value,live)}</strong><span>{sub}</span></div><i><Icon size={25}/></i></button>)}</div>
 {navigation}
 <p className="muted" role="status">{available.coverage}. {available.partial?'Available totals exclude missing or offline readings. Nodes are checked again automatically.':'Current readings from all nodes.'}</p>
 <div className="pve-grid"><Card className="pve-wide"><WidgetHeader title="Cluster Nodes" action="View All Nodes" onClick={()=>setView('Nodes')}/>{nodes.length?nodeTable(nodes.slice(0,5)):<p className="muted">{live.loading?<ReportLoading/>:'Connect a cluster through Cluster Settings to load its nodes.'}</p>}</Card>
 <Card><WidgetHeader title="Cluster Health"/><div className="pve-health"><ShieldCheck size={39}/><div><b>{health}</b><small>Based on available API readings</small></div></div><div className="pve-health-row"><span>Quorum status</span><b>{cluster?.quorate==null?'Not reported':cluster.quorate?'Quorate':'Not quorate'}</b></div><div className="pve-health-row"><span>Online nodes</span><b>{data?`${online}/${nodes.length}`:'Unknown'}</b></div>{services.slice(0,4).map((s:any)=><div key={s.id} className="pve-health-row"><span>{s.node}: {s.name}</span><b>{s.status}</b></div>)}<button className="pve-text-button" onClick={()=>setView('Nodes')}>View Full Health →</button></Card>
 <Card className="pve-wide"><WidgetHeader title="Recent Tasks" action="View All Tasks" onClick={()=>setView('Tasks & Logs')}/>{recent.length?taskTable(recent.slice(0,5)):<p className="muted">{tasks.error||tasks.data?.errors?.join('; ')||'No tasks reported during this period.'}</p>}</Card>
 <Card className="pve-resource-summary"><WidgetHeader title="Resource Summary"/><DistributionSummary items={available.storage.map((s:any,i:number)=>({id:s.id,name:`${s.node}/${s.name}`,value:s.used,color:colors[i%colors.length],display:`${bytes(s.used)} (${pct(s.usage)})`,onClick:()=>setView('Storage')}))} total={bytes(usedStorage)} label="Measured usage" format={bytes} footer={`Available per-node usage; shared storage entries may represent the same pool. Measured capacity: ${bytes(totalStorage)}.`}/></Card></div>
 <Card className="pve-quick"><WidgetHeader title="Quick Actions"/><div>{[['Create VM','Create an installation-ready virtual machine',Monitor,()=>create('Create VM'),!operator],['Create CT','Create an unprivileged container',Box,()=>create('Create CT'),!operator],['Backup Guest','Run a VM or container backup',Archive,()=>navigate('/backups?action=Run%20Backup'),!operator],['Cluster Backup','Manage real backup schedules',HardDrive,()=>navigate('/backups'),false],['Shell Access','Choose a node for SSH access',Terminal,()=>navigate('/tools/shell'),!['admin','owner'].includes(session.data?.user?.role)],['Task Viewer','Inspect task status and logs',ListChecks,()=>setView('Tasks & Logs'),false]].map(([label,sub,Icon,click,disabled]:any)=><button key={label} disabled={disabled} onClick={click}><Icon size={24}/><span><b>{label}</b><small>{sub}</small></span></button>)}</div></Card></>
 :view==='Nodes'?<ClusterNodes navigation={navigation} data={data} metrics={history.data?.metrics||[]} tasks={recent} network={network.data} hours={hours} role={session.data?.user?.role} refresh={refresh}/>
 :view==='Virtual Machines'?<VirtualMachines loading={live.loading&&!live.error} navigation={navigation} data={data} role={session.data?.user?.role} clusterUrl={data?.cluster?.url} refresh={refresh}/>
 :view==='LXC Containers'?<LxcContainers loading={live.loading&&!live.error} navigation={navigation} data={data} role={session.data?.user?.role} clusterUrl={data?.cluster?.url} refresh={refresh}/>
 :view==='Storage'?<ProxmoxStorage navigation={navigation} role={session.data?.user?.role} clusterUrl={data?.cluster?.url}/>
 :view==='Tasks & Logs'?<ProxmoxTasks navigation={navigation} data={data} role={session.data?.user?.role} clusterUrl={data?.cluster?.url} hours={hours}/>
 :view==='Networks'?<ProxmoxNetworks navigation={navigation} role={session.data?.user?.role} clusterUrl={data?.cluster?.url}/>
 :null}
 {taskResult&&<Card><div className="widget-title"><h3>Task Result</h3><button className="btn ghost" onClick={()=>setTaskResult(null)}>Close</button></div><pre className="live-output">{JSON.stringify(taskResult,null,2)}</pre></Card>}
 <footer className="pve-footer"><span>{data?.sampledAt?`Last measurement: ${new Date(data.sampledAt).toLocaleString()}`:'Waiting for cluster measurements'}</span><Link className="btn secondary small" to="/settings?tab=Connections">Manage Connections</Link></footer></div>;
}
function WidgetHeader({title,action,onClick}:{title:string;action?:string;onClick?:()=>void}){return <div className="widget-title"><h3>{title}</h3>{action&&<button className="pve-text-button" onClick={onClick}>{action} →</button>}</div>;}
function Spark({rows,node,metric,hours,color}:{rows:any[];node:string;metric:string;hours:string;color:string}){const points=rows.filter(r=>new Date(r.time).getTime()>Date.now()-Number(hours)*3600000).map(r=>({value:r.nodes?.find((n:any)=>n.name===node)?.[metric]??null}));return points.some(r=>r.value!=null)?<div className="pve-spark"><ResponsiveContainer width="100%" height={30}><AreaChart data={points}><Area dataKey="value" stroke={color} fill={`${color}18`} strokeWidth={1.5} isAnimationActive={false} connectNulls={false}/></AreaChart></ResponsiveContainer></div>:null;}
