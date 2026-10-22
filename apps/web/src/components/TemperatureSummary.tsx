import {useState} from 'react';
import {Thermometer,ArrowUpRight} from 'lucide-react';
import {useApi} from '../hooks';
import {Link} from 'react-router-dom';
import {Card,Badge} from './UI';
import ReportLoading from './ReportLoading';
import './temperatures.css';
type Reading={name:string;celsius:number;kind:string};
const degrees=(value:number)=>`${Number(value.toFixed(1))} °C`;
function TemperatureHost({node}:{node:any}){
 const [expanded,setExpanded]=useState(false);
 const readings:Reading[]=[...(node.report?.temperatures||[]).map((r:any)=>({...r,kind:'Sensor'})),...(node.report?.disks||[]).map((r:any)=>({...r,kind:'Disk'}))].filter(r=>typeof r.celsius==='number'&&Number.isFinite(r.celsius)).sort((a,b)=>b.celsius-a.celsius);
 const current=node.status==='current',peak=current?readings[0]?.celsius:undefined,high=peak!==undefined&&peak>=80;
 // Use a temperature scale, expanding it to preserve outliers instead of clipping readings.
 const low=Math.min(0,Math.floor((readings.at(-1)?.celsius??0)/20)*20),upper=Math.max(100,Math.ceil((readings[0]?.celsius??100)/20)*20);
 const fraction=(v:number)=>Math.max(0,Math.min(1,(v-low)/(upper-low)));
 const arc='M 37.57 118.43 A 60 60 0 1 1 122.43 118.43';
 return <section className={`thermal-host ${high?'thermal-warning':''}`} aria-label={`${node.name} temperatures`}>
  <div className="thermal-host-head"><strong>{node.name}</strong><Badge tone={!current||peak===undefined?'gray':high?'red':'blue'}>{!current?node.status:peak===undefined?'Unavailable':high?'High reading':'Live'}</Badge></div>
  <div className="thermal-body"><div className="thermal-gauge"><svg viewBox="0 0 160 150" role="img" aria-label={`${node.name}: ${peak===undefined?'current temperature unavailable':degrees(peak)+' maximum'}. Scale ${low} to ${upper} °C.`}>
   <path className="thermal-track" d={arc} pathLength="100"/>
   {peak!==undefined&&<><path className="thermal-fill" d={arc} pathLength="100" strokeDasharray={`${fraction(peak)*100} 100`}/><path className="thermal-threshold" d={arc} pathLength="100" strokeDasharray="0.7 100" strokeDashoffset={-fraction(80)*100}/></>}
   <text className="thermal-number" x="80" y="78" textAnchor="middle">{peak===undefined?'—':Number(peak.toFixed(1))}</text><text className="thermal-unit" x="80" y="100" textAnchor="middle">°C</text><text className="thermal-scale" x="26" y="143" textAnchor="middle">{low}°</text><text className="thermal-scale" x="134" y="143" textAnchor="middle">{upper}°</text>
  </svg><span className="thermal-caption">Maximum reported temperature</span></div>
  <div className="thermal-readings">{current&&readings.length?(expanded?readings:readings.slice(0,3)).map((r,i)=><div className={`thermal-sensor ${r.celsius>=80?'is-high':''}`} key={`${r.kind}:${r.name}:${i}`}><div><span title={r.name}>{r.name}<small>{r.kind}</small></span><b>{degrees(r.celsius)}</b></div><div className="thermal-bar" aria-hidden="true"><i style={{width:`${fraction(r.celsius)*100}%`}}/><em style={{left:`${fraction(80)*100}%`}}/></div></div>):<p className="muted">{current?'No supported temperature measurements.':'Current temperature unavailable. Previous readings are not shown as live.'}</p>}
  {current&&readings.length>3&&<button className="thermal-expand" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show fewer sensors':`View all ${readings.length} sensors`}</button>}</div></div>
  <div className="thermal-sample">Last received: {node.report?.receivedAt?new Date(node.report.receivedAt).toLocaleString():'No sample'}</div>
 </section>;
}
export default function TemperatureSummary(){
 const live=useApi<any>('/operations/health',null,30000);
 return <Card className="temperature-dashboard"><div className="monitor-panel-head"><h3><Thermometer size={17}/>Hardware temperatures</h3><Link to="/monitoring?tab=Hardware%20%26%20Diagnostics" aria-label="Open hardware diagnostics"><ArrowUpRight size={17}/></Link></div>
 {live.loading&&!live.data?<ReportLoading message="Reading host temperatures…"/>:live.error?<p role="alert">Temperature measurements unavailable. {live.error}</p>:!(live.data?.nodes||[]).length?<p className="muted">No paired hosts report temperatures.</p>:<div className="thermal-grid">{live.data.nodes.map((node:any)=><TemperatureHost key={node.id} node={node}/>)}</div>}
 <div className="thermal-legend"><span><i/>Measured temperature</span><span><i className="threshold"/>80 °C warning marker</span></div><p className="thermal-note">General warning threshold; verify unusual readings against sensor support and manufacturer limits.</p></Card>;
}
