import ClusterTopology from '../components/ClusterTopology';
import {InspectableRow} from '../components/TableActions';
import ReportLoading from '../components/ReportLoading';
import {networkAddress} from '../network-readings';
import NetworkTraffic from './NetworkTraffic';
import NetworkDNS from './NetworkDNS';
import NetworkRouting from './NetworkRouting';
import NetworkDevices from './NetworkDevices';
import ProxmoxNetworks from './ProxmoxNetworks';
import {useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {Network as NetworkIcon,Server,Shield,RefreshCw,Download,Layers} from 'lucide-react';
import {useApi} from '../hooks';
import {Card,PageHeader,Stat,Tabs,Modal} from '../components/UI';
import DockerHostSelector from '../components/DockerHostSelector';
export default function Network(){
 const cluster=useApi<any>('/proxmox',null);
 const live=useApi<any>('/network',null),session=useApi<any>('/auth/me',null);
 const [params,setParams]=useSearchParams();
 const sections=['Network Map','Interfaces','Devices','Routing','DNS','Traffic Analysis','Docker Networks'];
 const tab=sections.includes(params.get('tab')||'')?params.get('tab')!:'Network Map';
 const setTab=(value:string)=>{const next=new URLSearchParams(params);next.set('tab',value);setParams(next);};
 const [search,setSearch]=useState(''),[selected,setSelected]=useState<any>(null);
 const data=live.data,interfaces=data?.interfaces||[],networks=data?.networks||[],connectors=data?.connectors||[];
 const admin=['admin','owner'].includes(session.data?.user?.role);
 const status=(r:any)=>r.running===true||r.active===1||r.active==='1'||r.active===true||/^(up|online)$/i.test(r.status||'')?'Up':r.running===false||r.active===0||r.active==='0'||r.active===false||/^(down|offline)$/i.test(r.status||'')?'Down':'Unknown';
 const configured=connectors.filter((r:any)=>r.status!=='not-configured'),reachable=configured.filter((r:any)=>r.status==='reachable').length;

 const rows=(tab==='Docker Networks'?networks:interfaces).filter((r:any)=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
 const exportReport=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({network:data,topology:cluster.data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='homecloud-network.json';a.click();URL.revokeObjectURL(url)};
 const navigation=<Tabs items={['Network Map','Interfaces','Devices','Routing','DNS','Traffic Analysis','Docker Networks']} active={tab} onChange={v=>{setTab(v);setSearch('')}}/>;
 return <div className="network-overview">{!['Interfaces','Devices','Routing','DNS','Traffic Analysis'].includes(tab)&&<PageHeader title="Network Overview" subtitle="Explore connected nodes, virtual machines and containers." actions={<><button className="btn secondary" aria-busy={live.loading||cluster.loading} disabled={live.loading||cluster.loading} onClick={()=>Promise.all([live.refresh(),cluster.refresh()])}><RefreshCw size={15}/> Refresh</button><button className="btn secondary" disabled={!data} onClick={exportReport}><Download size={15}/> Export</button><Link className="btn primary" to="/proxmox?tab=Networks"><NetworkIcon size={14}/>Manage Interfaces</Link></>}/>}
 {live.error&&<p role="alert" className="error">{live.error}</p>}
 {!['Interfaces','Devices','Routing','DNS','Traffic Analysis'].includes(tab)&&<div className="network-stats metric-grid"><Stat reading={live} label="Provider Availability" value={configured.length?`${reachable}/${configured.length}`:'Unknown'} sub="Responding providers" icon={<Shield/>}/><Stat reading={cluster} label="Network Nodes" value={cluster.data?cluster.data.nodes?.length??0:'Unknown'} sub="Reported Proxmox nodes" icon={<Server/>}/><Stat reading={live} label="Interfaces" value={data?interfaces.length:'Unknown'} sub={`${interfaces.filter((r:any)=>status(r)==='Up').length} reported up`} icon={<NetworkIcon/>}/><Stat reading={live} label="Docker Networks" value={data?.dockerHost?.name?networks.length:'Unknown'} sub="Selected Docker host" icon={<Layers/>}/></div>}
 {!['Interfaces','Devices','Routing','DNS','Traffic Analysis'].includes(tab)&&navigation}
 {tab==='Traffic Analysis'?<NetworkTraffic navigation={navigation}/>:tab==='DNS'?<NetworkDNS navigation={navigation}/>:tab==='Routing'?<NetworkRouting navigation={navigation} onMap={()=>setTab('Network Map')}/>:tab==='Devices'?<NetworkDevices navigation={navigation}/>:tab==='Interfaces'?<ProxmoxNetworks navigation={navigation} interfaceView role={session.data?.user?.role} clusterUrl={cluster.data?.cluster?.url}/>:<div className="network-layout network-topology-layout"><div>{tab==='Network Map'?<ClusterTopology data={cluster.data} loading={cluster.loading} error={cluster.error}/>:<Card><div className="network-panel-head"><h3>{tab}</h3><input aria-label="Search network resources" placeholder="Search name, address or node…" value={search} onChange={e=>setSearch(e.target.value)}/></div>{tab==='Docker Networks'&&<><DockerHostSelector/><p className="muted">Selected host: {data?.dockerHost?.name||data?.dockerHost?.id||'Unavailable'}. Manage network resources from your Docker host.</p></>}<div className="table-wrap" tabIndex={0} role="region" aria-label="Network resources table, scroll horizontally for all columns"><table className="single-line-table"><thead><tr><th>Name</th><th>{tab==='Traffic Analysis'?<NetworkTraffic navigation={navigation}/>:tab==='DNS'?<NetworkDNS navigation={navigation}/>:'Node / driver'}</th><th>{tab==='Traffic Analysis'?<NetworkTraffic navigation={navigation}/>:tab==='DNS'?<NetworkDNS navigation={navigation}/>:'Address / subnet'}</th><th>Actions</th></tr></thead><tbody>{rows.map((r:any,i:number)=><InspectableRow onInspect={()=>setSelected(r)} aria-label={`Inspect ${r.name||r.iface||r.id}`} key={r.id||r.name||i}><td>{r.name||r.iface||r.id}</td><td>{r.description||r.node||r.driver||r.provider||'Unknown'}</td><td>{tab==='Traffic Analysis'?<NetworkTraffic navigation={navigation}/>:tab==='DNS'?<NetworkDNS navigation={navigation}/>:r.address||r.cidr||JSON.stringify(r.subnets||r.IPAM?.Config||[])}</td><td><button className="btn secondary small" onClick={()=>setSelected(r)}>Details</button></td></InspectableRow>)}</tbody></table></div>{!rows.length&&<p className="muted">{live.loading?<ReportLoading/>:'No matching resources reported.'}</p>}<small className="muted">{rows.length} resources</small></Card>}</div>
</div>}
 {['Network Map'].includes(tab)&&(data?.errors?.length>0||connectors.some((r:any)=>r.error))&&<Card><details><summary>Connection diagnostics</summary>{data?.errors?.map((e:string,i:number)=><p className="muted small" key={i}>{e}</p>)}{connectors.filter((r:any)=>r.error).map((r:any)=><p className="muted small" key={r.name}>{r.name}: {r.error}</p>)}</details></Card>}
 <small className="muted">Last measurement: {data?.sampledAt?new Date(data.sampledAt).toLocaleString():'Pending'}</small>
 <Modal open={!!selected} title={selected?.name||selected?.iface||'Network details'} onClose={()=>setSelected(null)}><dl className="network-inspector">{Object.entries({Name:selected?.name||selected?.iface,Host:selected?.node||selected?.provider,Address:selected?networkAddress(selected):null,Type:selected?.type||selected?.driver,Status:selected?status(selected):null,Ports:selected?.bridge_ports,Parent:selected?.['vlan-raw-device'],MTU:selected?.mtu}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value??'Not reported')}</dd></div>)}</dl><details><summary>Raw interface details</summary><pre className="live-output">{JSON.stringify(selected,null,2)}</pre></details></Modal></div>;
}
