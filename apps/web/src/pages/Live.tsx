import { useEffect, useState } from 'react';
import { ClusterConnection } from '../components/ClusterConnection';
import { AreaChart,Area,ResponsiveContainer,XAxis,YAxis,Tooltip } from 'recharts';
import { useApi } from '../hooks';
import { api,confirmedApi } from '../api';
import { Card,PageHeader,Stat,Button,Modal,Tabs,Badge } from '../components/UI';
import { DataTable } from '../components/DataTable';

type Field={name:string;label:string;type?:string;required?:boolean;options?:string[];placeholder?:string;min?:number;max?:number};
type Action={label:string;path:string|((row:any)=>string);method?:string;body?:any|((row:any)=>any);fields?:Field[];role?:string;when?:(row:any)=>boolean};
type View={name:string;key:string;columns:string[];actions?:Action[]};
const enc=encodeURIComponent;
const ranks:any={viewer:10,auditor:20,operator:30,admin:40,owner:50};
const bytes=(v:any)=>{if(v==null)return 'Unavailable';const n=Number(v);if(!Number.isFinite(n))return String(v);const units=['B','KiB','MiB','GiB','TiB'];const i=Math.min(Math.floor(Math.log(Math.max(n,1))/Math.log(1024)),4);return `${(n/1024**i).toFixed(i?1:0)} ${units[i]}`;};
const display=(key:string,v:any)=>{
 if(v==null||v==='')return 'Unavailable';
 if(['size','used','available','capacity','memoryTotal','memoryBytes'].includes(key)&&typeof v==='number')return bytes(v);
 if(key==='memory'&&typeof v==='number')return bytes(v);
 if(['cpu','usage','memoryPercent'].includes(key)&&typeof v==='number')return `${v}%`;
 if(key==='response'&&typeof v==='number')return `${v} ms`;
 if(key==='uptime'&&typeof v==='number')return `${Math.floor(v/86400)}d ${Math.floor(v%86400/3600)}h`;
 if(typeof v==='boolean')return v?'Yes':'No';
 return typeof v==='object'?JSON.stringify(v):String(v);
};
const labels:any={vmid:'Guest ID',id:'ID',cpu:'CPU',memory:'Memory',memoryPercent:'Memory %',response:'Response time','next-run':'Next run','prune-backups':'Retention',lastSeen:'Last seen',mountpoint:'Mount point',driver:'Driver',authorized:'Authorized'};
const field=(name:string,label:string,type='text',placeholder?:string):Field=>({name,label,type,required:true,placeholder});
const backupFields=[field('name','Job name'),field('node','Proxmox node'),field('vmid','VM/container IDs','text','101,102'),field('storage','Backup storage ID'),field('schedule','Proxmox calendar schedule','text','02:00 or sun 03:00'),{...field('retention','Retention','text','keep-last=7,keep-weekly=4'),required:false}];
function State({error,loading}:{error?:string;loading?:boolean}){return <Card>{error?<p role="alert" className="login-error">{error}</p>:loading?<p>Loading live data…</p>:<p>No records returned by the connected provider.</p>}</Card>;}
function Connections({services=[]}:{services?:any[]}){return <div className="live-connections">{services.map(s=><div key={s.name} className="list-row"><b>{s.name}</b><Badge tone={s.status==='reachable'?'green':s.status==='not-configured'?'gray':'red'}>{s.status}</Badge>{s.error&&<span role="alert">{s.error}</span>}</div>)}</div>;}
export function LiveTablePage({title,subtitle,endpoint,views,actions=[],note}:{title:string;subtitle:string;endpoint:string;views:View[];actions?:Action[];note?:string}){
 const {data,error,loading,refresh}=useApi<any>(endpoint,null);
 const {data:session}=useApi<any>('/auth/me',null);
 const [view,setView]=useState(views[0].name),[dialog,setDialog]=useState<{action:Action;row:any}|null>(null),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState(''),[result,setResult]=useState<any>(null);
 const allowed=(a:Action)=>ranks[session?.user?.role]>=ranks[a.role||'operator'];
 const execute=async(action:Action,row:any={},fields:any={})=>{
   setPending(true);setFailure('');setMessage('');setResult(null);
   try{const base=typeof action.body==='function'?action.body(row):action.body||{};const path=typeof action.path==='function'?action.path({...row,...fields}):action.path;
     const method=action.method||'POST';const response:any=await confirmedApi(path,{method,...(method==='GET'?{}:{body:JSON.stringify({...base,...fields})})});
     setMessage(response.message||'Live data retrieved.');setResult(response.result??response);setDialog(null);await refresh();
   }catch(e:any){setFailure(e.message);}finally{setPending(false);}
 };
 const trigger=(action:Action,row:any={})=>{setFailure('');action.fields?.length?setDialog({action,row}):execute(action,row);};
 const active=views.find(v=>v.name===view)||views[0];const rows=data?.[active.key]||[];
 return <><PageHeader title={title} subtitle={subtitle} actions={<><Button variant="secondary" disabled={loading||pending} onClick={refresh}>Refresh</Button>{actions.filter(allowed).map(a=><Button key={a.label} disabled={pending} onClick={()=>trigger(a)}>{a.label}</Button>)}</>}/>
 {note&&<p className="muted">{note}</p>}{data?.sampledAt&&<p className="muted small">Last measurement: {new Date(data.sampledAt).toLocaleString()}</p>}
 <Connections services={data?.connectors||data?.services?.filter((s:any)=>s.provider)||data?.integrations}/>
 {data?.errors?.map((e:string)=><p key={e} className="login-error" role="alert">{e}</p>)}
 {failure&&<p role="alert" className="login-error">{failure}</p>}{message&&<p role="status">{message}</p>}
 {result&&<Card><details open><summary>Operation result</summary><pre className="live-output">{result.logs||JSON.stringify(result,null,2)}</pre></details></Card>}
 <Tabs items={views.map(v=>v.name)} active={view} onChange={setView}/>
 {error||!data?<State error={error} loading={loading}/>:<Card>{rows.length?<DataTable rows={rows} columns={[...active.columns.map(key=>({key,label:labels[key]||key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()),render:(r:any)=>display(key,r[key])})),...(active.actions?.some(allowed)?[{key:'actions',label:'Actions',render:(r:any)=><div className="row-actions">{active.actions!.filter(a=>allowed(a)&&(!a.when||a.when(r))).map(a=><button className="btn ghost" key={a.label} disabled={pending} onClick={()=>trigger(a,r)}>{a.label}</button>)}</div>}]:[])]}/>:<p>No records returned by the connected provider.</p>}</Card>}
 <Modal open={!!dialog} title={dialog?.action.label||''} onClose={()=>!pending&&setDialog(null)}>{dialog&&<form className="form-grid" onSubmit={e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));execute(dialog.action,dialog.row,values);}}>
 {dialog.action.fields?.map(f=><label key={f.name}>{f.label}{f.options?<select name={f.name}>{f.options.map(o=><option key={o}>{o}</option>)}</select>:<input name={f.name} type={f.type||'text'} required={f.required} placeholder={f.placeholder} min={f.min} max={f.max}/>}</label>)}
 {failure&&<p role="alert" className="login-error">{failure}</p>}<div className="modal-actions"><button type="button" className="btn secondary" disabled={pending} onClick={()=>setDialog(null)}>Cancel</button><button type="submit" className="btn primary" disabled={pending}>{pending?'Working…':'Submit'}</button></div></form>}</Modal>
 </>;
}
const guestActions=(type:string)=>['start','shutdown','stop','reboot'].map(operation=>({label:operation,path:(r:any)=>`/actions/proxmox/${type}/${enc(r.id)}/${operation}`,body:(r:any)=>({node:r.node})}));
export function Proxmox(){return <><ClusterConnection/><LiveTablePage title="Proxmox" subtitle="Live nodes, guests and storage from the Proxmox API." endpoint="/proxmox" views={[
 {name:'Nodes',key:'nodes',columns:['name','status','cpu','memoryPercent','cores','uptime']},
 {name:'Virtual Machines',key:'vms',columns:['id','name','node','status','cpu','memory','uptime'],actions:[...guestActions('vm'),{label:'Snapshot',path:(r:any)=>`/actions/proxmox/vm/${enc(r.id)}/snapshot`,body:(r:any)=>({node:r.node}),fields:[field('name','Snapshot name')]},{label:'Backup',path:'/proxmox/backup',body:(r:any)=>({node:r.node,vmid:r.id}),fields:[field('storage','Backup storage ID')]}]},
 {name:'LXC Containers',key:'lxc',columns:['id','name','node','status','cpu','memory'],actions:guestActions('lxc')},
 {name:'Storage',key:'storage',columns:['node','name','status','capacity','used','available','usage']}
 ]} actions={[{label:'Create VM',path:'/proxmox/vm',fields:[field('name','VM name'),field('node','Node'),field('storage','Disk storage ID'),field('cores','CPU cores','number'),field('memory','Memory MB','number'),field('disk','Disk GB','number'),field('bridge','Network bridge')]}]} note="VM creation allocates an empty guest. Install an OS using Proxmox or a template afterward. Lifecycle and backup operations may return asynchronous task IDs."/></>;}
export function Docker(){return <LiveTablePage title="Docker" subtitle="Live Docker Engine resources and existing Compose projects." endpoint="/docker" views={[
 {name:'Containers',key:'containers',columns:['name','image','status','ports','cpu','memory','statsError'],actions:[...['start','stop','restart','pause','unpause','remove'].map(operation=>({label:operation,path:(r:any)=>`/actions/docker/container/${enc(r.id)}/${operation}`})),{label:'Logs',method:'GET',path:(r:any)=>`/docker/container/${enc(r.id)}/logs`}]},
 {name:'Images',key:'images',columns:['name','size','created']},
 {name:'Volumes',key:'volumes',columns:['name','driver','mountpoint'],actions:[{label:'Remove',role:'admin',method:'DELETE',path:(r:any)=>`/docker/volume/${enc(r.id)}`}]},
 {name:'Networks',key:'networks',columns:['name','driver','scope','subnets','internal'],actions:[{label:'Remove',role:'admin',method:'DELETE',path:(r:any)=>`/docker/network/${enc(r.id)}`}]},
 {name:'Compose Projects',key:'stacks',columns:['name','containers'],actions:['start','stop','restart'].map(action=>({label:action,path:(r:any)=>`/docker/stack/${enc(r.id)}/${action}`}))}
 ]} actions={[{label:'Create Container',path:'/docker/container',fields:[field('name','Name'),field('image','Image','text','nginx:alpine'),{...field('ports','Port mapping','text','8080:80'),required:false}]},{label:'Create Volume',path:'/docker/volume',fields:[field('name','Volume name')]},{label:'Create Network',path:'/docker/network',fields:[field('name','Network name')]},{label:'Prune',role:'admin',path:(r:any)=>`/docker/prune/${enc(r.kind)}`,fields:[{name:'kind',label:'Resource type',options:['containers','images','volumes','networks']}]}]} note="Compose project controls act on existing containers. Compose file deployment is not implemented. CPU is measured per container; host CPU, filesystem capacity and uptime are not inferred."/>;}
export function Storage(){return <LiveTablePage title="Storage" subtitle="Proxmox storage and TrueNAS pools, datasets, disks and snapshots." endpoint="/storage" views={[
 {name:'Pools',key:'pools',columns:['provider','node','name','status','capacity','used','available','usage'],actions:[{label:'Scrub',role:'admin',path:(r:any)=>`/truenas/pool/${enc(r.id)}/scrub`,when:r=>r.provider==='truenas'}]},
 {name:'Datasets',key:'datasets',columns:['name','type','used','available','mountpoint'],actions:[{label:'Snapshot',path:'/truenas/snapshot',body:(r:any)=>({dataset:r.name}),fields:[field('name','Snapshot name')]}]},
 {name:'Snapshots',key:'snapshots',columns:['name','dataset','created'],actions:[{label:'Rollback',role:'admin',path:(r:any)=>`/truenas/snapshot/${enc(r.id)}/rollback`},{label:'Delete',role:'admin',method:'DELETE',path:(r:any)=>`/truenas/snapshot/${enc(r.id)}`}]},
 {name:'Disks',key:'disks',columns:['name','model','serial','size','type']},
 {name:'Docker Volumes',key:'volumes',columns:['name','driver','mountpoint']}
 ]} actions={[{label:'Create Dataset',role:'admin',path:'/truenas/dataset',fields:[field('name','Dataset path','text','pool/dataset')]}]} note="Proxmox storage entries are per node and may refer to the same shared pool. Their capacities are not added together. Snapshot rollback changes dataset contents and requires typed confirmation."/>;}
export function Network(){return <LiveTablePage title="Network & OPNsense" subtitle="Live interfaces, Docker networks and OPNsense services." endpoint="/network" views={[
 {name:'Interfaces',key:'interfaces',columns:['provider','node','name','id','address','status','type'],actions:[]},
 {name:'Docker Networks',key:'networks',columns:['name','driver','subnets','scope']},
 {name:'Firewall Services',key:'services',columns:['name','description','running'],actions:['start','stop','restart'].map(action=>({label:action,role:'admin',path:(r:any)=>`/opnsense/service/${enc(r.name)}/${action}`}))}
 ]} actions={[{label:'Reload Firewall Interface',role:'admin',path:(r:any)=>`/opnsense/interface/${enc(r.id)}/reload`,fields:[field('id','OPNsense interface identifier')]}]} note="No inferred topology, DNS counts or bandwidth values are shown. API privileges and available fields depend on your OPNsense version."/>;}
export function Vpn(){return <LiveTablePage title="Tailscale VPN" subtitle="Live tailnet devices, authorization and subnet routes." endpoint="/vpn" views={[
 {name:'Devices',key:'devices',columns:['name','user','addresses','os','lastSeen','authorized','routes'],actions:[
 {label:'Authorize',role:'admin',path:(r:any)=>`/vpn/device/${enc(r.id)}/authorize`,body:{authorized:true}},
 {label:'Revoke Authorization',role:'admin',path:(r:any)=>`/vpn/device/${enc(r.id)}/authorize`,body:{authorized:false}},
 {label:'Enable Advertised Routes',role:'admin',path:(r:any)=>`/vpn/device/${enc(r.id)}/routes`,body:(r:any)=>({routes:r.advertisedRoutes})},
 {label:'Disable Routes',role:'admin',path:(r:any)=>`/vpn/device/${enc(r.id)}/routes`,body:{routes:[]}},
 {label:'Remove Device',role:'admin',method:'DELETE',path:(r:any)=>`/vpn/device/${enc(r.id)}`}]}]} note="Last seen is reported by Tailscale; it is not presented as a real-time connectivity guarantee. API keys and tailnet names are configured on the server."/>;}
export function Backups(){return <LiveTablePage title="Backups" subtitle="Proxmox backup jobs and real backup archives." endpoint="/backups" views={[
 {name:'Backup Jobs',key:'jobs',columns:['id','comment','node','vmid','storage','schedule','enabled','prune-backups'],actions:[{label:'Run',path:(r:any)=>`/backups/${enc(r.id)}/run`}]},
 {name:'Archives',key:'points',columns:['node','storage','volid','type','vmid','created','size','protected']}
 ]} actions={[{label:'Create Backup Job',role:'admin',path:'/backups',fields:backupFields}]} note="The Proxmox scheduler executes these jobs. A queued backup is not marked successful until Proxmox reports completion; task history is available on Monitoring."/>;}
export function Schedules(){return <LiveTablePage title="Schedules" subtitle="Schedules owned and executed by Proxmox and TrueNAS." endpoint="/schedules" views={[
 {name:'Proxmox Backups',key:'items',columns:['id','comment','node','vmid','schedule','next-run','enabled'],actions:[{label:'Toggle',role:'admin',path:(r:any)=>`/schedules/${enc(r.id)}/toggle`},{label:'Delete',role:'admin',method:'DELETE',path:(r:any)=>`/schedules/${enc(r.id)}`}]},
 {name:'TrueNAS Snapshots',key:'truenas',columns:['id','dataset','schedule','lifetime_value','lifetime_unit','enabled'],actions:[{label:'Toggle',role:'admin',path:(r:any)=>`/truenas/schedule/${enc(r.id)}/toggle`}]}
 ]} actions={[{label:'Schedule Backup',role:'admin',path:'/schedules',fields:backupFields},{label:'Schedule Snapshots',role:'admin',path:'/truenas/schedule',fields:[field('dataset','Dataset'),{...field('hour','Hour','number'),min:0,max:23},{...field('minute','Minute','number'),min:0,max:59},{...field('lifetime','Retention days','number'),min:1,max:3650}]}]}/>;}
export function Retention(){return <LiveTablePage title="Retention" subtitle="Provider-managed backup and snapshot retention." endpoint="/retention" views={[
 {name:'Proxmox Jobs',key:'policies',columns:['id','comment','node','storage','vmid','rule','schedule','enabled'],actions:[{label:'Set Retention',role:'admin',path:'/retention',body:(r:any)=>({jobId:r.id}),fields:[field('rule','Rule','text','keep-last=7,keep-weekly=4')]}]},
 {name:'TrueNAS Snapshot Lifetimes',key:'truenas',columns:['id','dataset','lifetime_value','lifetime_unit','enabled']}
 ]} actions={[{label:'Preview Cleanup',role:'admin',method:'GET',path:(r:any)=>`/retention/preview?${new URLSearchParams(r)}`,fields:[field('node','Node'),field('storage','Backup storage ID'),field('rule','Rule','text','keep-last=7'),{...field('vmid','Guest ID','number'),required:false}]},
 {label:'Run Cleanup',role:'admin',path:'/retention/run',fields:[field('node','Node'),field('storage','Backup storage ID'),field('rule','Rule','text','keep-last=7'),{...field('vmid','Guest ID','number'),required:false}]}]} note="Preview lists which archives Proxmox would retain or remove. Cleanup requires typed confirmation. TrueNAS snapshot lifetimes are applied by its periodic snapshot tasks."/>;}
export function Restore(){return <LiveTablePage title="Restore" subtitle="Restore real Proxmox archives or roll back TrueNAS snapshots." endpoint="/restore" views={[
 {name:'Proxmox Archives',key:'points',columns:['node','storage','volid','type','vmid','created','size'],actions:[{label:'Restore to New Guest',role:'admin',path:(r:any)=>`/restore/${enc(r.id)}/run`,fields:[field('vmid','Unused VM/container ID','number'),field('storage','Destination disk storage ID'),field('node','Destination node')]}]},
 {name:'TrueNAS Snapshots',key:'snapshots',columns:['name','dataset','created'],actions:[{label:'Rollback',role:'admin',path:(r:any)=>`/truenas/snapshot/${enc(r.id)}/rollback`}]}
 ]} note="Proxmox restore requires an unused guest ID and never requests force overwrite. TrueNAS rollback requires typed confirmation and does not destroy newer snapshots automatically."/>;}
export function Alerts(){return <LiveTablePage title="Alerts" subtitle="Actual connection failures, TrueNAS alerts and measured threshold conditions." endpoint="/alerts" views={[
 {name:'Alerts',key:'alerts',columns:['title','severity','source','details','triggered','status'],actions:[{label:'Acknowledge',path:(r:any)=>`/alerts/${enc(r.id)}/resolve`}]},
 {name:'Rules',key:'rules',columns:['name','provider','metric','threshold','severity','enabled'],actions:[{label:'Delete',role:'admin',method:'DELETE',path:(r:any)=>`/alerts/rules/${enc(r.id)}`}]}]} actions={[{label:'Create Rule',role:'admin',path:'/alerts/rules',fields:[field('name','Name'),{name:'provider',label:'Provider',options:['all','proxmox','docker','truenas']},{name:'metric',label:'Metric',options:['cpu','memory','storage']},{...field('threshold','Threshold %','number'),min:1,max:100},{name:'severity',label:'Severity',options:['warning','critical']}]}]} note="Rules are evaluated every 30 seconds. Acknowledgment does not repair a condition; an alert resolves when a later successful measurement clears it. Notifications currently appear in this app."/>;}
export function Users(){return <LiveTablePage title="Users" subtitle="Real application accounts and role permissions." endpoint="/users" views={[{name:'Accounts',key:'users',columns:['name','email','role','status','lastLogin'],actions:[{label:'Toggle Active',role:'admin',path:(r:any)=>`/users/${enc(r.id)}/toggle`}]}]} actions={[{label:'Add User',role:'admin',path:'/users',fields:[field('name','Name'),field('email','Email','email'),{name:'role',label:'Role',options:['viewer','auditor','operator','admin']},field('password','Password (at least 12 characters)','password')]}]} note="Owners cannot be deactivated. Administrators can manage lower-privilege accounts. Passwords are required and are never displayed or logged."/>;}
export function Audit(){return <LiveTablePage title="Audit Logs" subtitle="The latest 500 recorded application actions, failures and submitted tasks." endpoint="/audit" views={[{name:'Events',key:'logs',columns:['time','user','action','resource','status','details','ip']}]} note="Queued means the provider accepted a task; check provider task history for its eventual outcome."/>;}
function Overview({monitoring=false}:{monitoring?:boolean}){
 const {data,error,loading,refresh}=useApi<any>(monitoring?'/monitoring':'/dashboard',null);
 return <><PageHeader title={monitoring?'Monitoring':'Overview'} subtitle="Measurements from connected integrations. Unavailable values remain unknown." actions={<Button disabled={loading} onClick={refresh}>Refresh</Button>}/>
 {!data||error?<State error={error} loading={loading}/>:<>
 <p className="muted">Last sample: {new Date(data.sampledAt).toLocaleString()} · History starts when this installation collects data.</p>
 {!monitoring&&<div className="stats-grid six">{[['Servers',data.stats.servers],['VMs',data.stats.vms],['LXC',data.stats.lxc],['Containers',data.stats.containers],['Active Alerts',data.stats.alerts],['Reachable services',`${data.stats.connected}/${data.stats.configured}`]].map(([label,value])=><Stat key={String(label)} label={String(label)} value={value??'Unavailable'}/>)}</div>}
 <Card><h3>Integration and service connectivity</h3><Connections services={data.services}/></Card>
 <Card><h3>Proxmox node averages (%)</h3><p className="muted">Average of reporting online Proxmox nodes. Gaps indicate missing measurements.</p><div style={{height:260}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.metrics}><XAxis dataKey="time" tickFormatter={v=>new Date(v).toLocaleTimeString()}/><YAxis domain={[0,100]}/><Tooltip/><Area dataKey="cpu" stroke="#3b82f6" fill="#3b82f622" connectNulls={false}/><Area dataKey="memory" stroke="#8b5cf6" fill="#8b5cf622" connectNulls={false}/></AreaChart></ResponsiveContainer></div></Card>
 <Card><h3>Reported hosts</h3><DataTable rows={data.hosts} columns={[{key:'name',label:'Host'},{key:'status',label:'Reported status'}]}/></Card>
 </>}
 {monitoring&&<LiveTablePage title="Provider Tasks" subtitle="Read actual backup, restore, maintenance and other task outcomes." endpoint="/tasks" views={[{name:'Proxmox Tasks',key:'proxmox',columns:['upid','node','type','id','starttime','endtime','status'],actions:[{label:'Status',role:'viewer',method:'GET',path:(r:any)=>`/tasks/${enc(r.node)}/${enc(r.upid)}`}]},{name:'TrueNAS Jobs',key:'truenas',columns:['id','method','state','progress','error']}]} />}
 </>;
}
export function Dashboard(){return <Overview/>;}
export function Monitoring(){return <Overview monitoring/>;}
export function Settings(){
 const {data,error,loading,refresh}=useApi<any>('/settings',null);const [message,setMessage]=useState(''),[failure,setFailure]=useState(''),[pending,setPending]=useState(false);
 const {data:session}=useApi<any>('/auth/me',null);
 const save=async(e:any)=>{e.preventDefault();setPending(true);setFailure('');try{const values=Object.fromEntries(new FormData(e.currentTarget));await api('/settings',{method:'PUT',body:JSON.stringify(values)});setMessage('Settings saved.');refresh();window.dispatchEvent(new Event('homecloud-settings'));}catch(e:any){setFailure(e.message);}finally{setPending(false);}};
 return <><PageHeader title="Settings" subtitle="Application settings and real integration status."/>{error||!data?<State error={error} loading={loading}/>:<>
 <Card><form className="form-grid" onSubmit={save} key={JSON.stringify(data.settings)}><label>Site Name<input name="siteName" required defaultValue={data.settings.siteName}/></label><label>Description<input name="description" defaultValue={data.settings.description}/></label><label>Page refresh interval (seconds)<input name="refresh" type="number" min="15" max="300" defaultValue={data.settings.refresh}/></label><button type="submit" className="btn primary" disabled={pending||ranks[session?.user?.role]<40}>Save</button></form>{failure&&<p role="alert">{failure}</p>}{message&&<p role="status">{message}</p>}</Card>
 <Card><h3>Integrations</h3><Connections services={data.integrations}/><p>Owners can configure Proxmox through Add / Edit Cluster on the Proxmox page. Configure other integrations in the server environment, then restart the API. Saved credentials are never returned to this page.</p></Card>
 <Card><h3>Capabilities</h3><p>API monitoring polls every 30 seconds. Notifications appear in this app. Owners can install software updates using the header Update button. An orange dot indicates a newer version. Application two-factor login is not implemented; use your deployment access controls.</p></Card>
 </>}</>;
}
export function AI(){const[msg,setMsg]=useState(''),[messages,setMessages]=useState<any[]>([]),[pending,setPending]=useState(false),[error,setError]=useState('');
 const send=async(e:any)=>{e.preventDefault();if(!msg.trim()||pending)return;const message=msg;setMsg('');setPending(true);setError('');setMessages(m=>[...m,{role:'user',text:message}]);try{const response:any=await api('/ai/chat',{method:'POST',body:JSON.stringify({message})});setMessages(m=>[...m,{role:'assistant',text:response.result.answer}]);}catch(e:any){setError(e.message);}finally{setPending(false);}};
 return <><PageHeader title="Assistant" subtitle="Read-only analysis of the latest live measurements."/><Card><p className="muted">This assistant cannot execute infrastructure actions or perform security scans. With no AI API key it returns a measured status summary.</p><div className="chat">{messages.map((m,i)=><div key={i} className={`bubble ${m.role}`}>{m.text}</div>)}</div>{error&&<p role="alert">{error}</p>}<form onSubmit={send} className="composer"><input value={msg} onChange={e=>setMsg(e.target.value)} required placeholder="Ask about your connected homelab"/><button className="btn primary" disabled={pending}>{pending?'Reading…':'Send'}</button></form></Card></>;
}
