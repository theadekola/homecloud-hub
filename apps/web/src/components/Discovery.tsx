import {useState} from 'react';
import {Card} from './UI';
import {DataTable} from './DataTable';
export function downloadReport(data:any){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`homecloud-report-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function Discovery({resources=[],reports=[]}:{resources?:any[];reports?:any[]}){
 const [search,setSearch]=useState('');
 const rows=resources.filter(r=>(r.name+' '+r.host).toLowerCase().includes(search.toLowerCase()));
 return <Card><h3>Automatically discovered services</h3><div className="header-actions"><input aria-label="Search discovered services" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search services or host"/><button className="btn secondary" onClick={()=>downloadReport({resources:rows,reports})}>Export inventory</button></div>{rows.length?<DataTable rows={rows.slice(0,100)} columns={['name','host','kind','status','source'].map(key=>({key,label:key}))}/>:<p>No services visible to the connected credentials.</p>}</Card>;
}
