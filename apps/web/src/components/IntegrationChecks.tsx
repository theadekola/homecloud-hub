import {useState} from 'react';
import {api} from '../api';
import {Card,Badge} from './UI';
export default function IntegrationChecks({search=''}:{search?:string}){
 const [diagnostics,setDiagnostics]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const check=async()=>{setBusy(true);setError('');setDiagnostics(null);try{setDiagnostics(await api('/diagnostics'))}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const download=()=>{try{const url=URL.createObjectURL(new Blob([JSON.stringify(diagnostics,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='homecloud-provider-diagnostics.json';a.click();URL.revokeObjectURL(url)}catch{setError('Diagnostics download is unavailable in this browser.')}};
 if(!'provider compatibility checks diagnostics read permissions'.includes(search.toLowerCase()))return null;
 return <Card><h3>Provider Compatibility Checks</h3><p className="muted">Check configured API reads and permission access. This does not create guests, change shares or verify write compatibility.</p><button type="button" className="btn secondary" disabled={busy} onClick={check}>{busy?'Checking providers…':'Run read-only checks'}</button>{error&&<p role="alert" className="error">{error}</p>}{diagnostics&&<><p>{diagnostics.note}</p><div className="table-wrap"><table><thead><tr><th>Provider</th><th>API read</th><th>Result</th></tr></thead><tbody>{diagnostics.checks.map((c:any)=><tr key={c.provider+c.method}><td>{c.provider}</td><td>{c.method}</td><td><Badge tone={c.status==='passed'?'green':'red'}>{c.status}</Badge>{c.message&&<small>{c.message}</small>}</td></tr>)}</tbody></table></div>{!diagnostics.checks.length&&<p>No configured providers.</p>}<pre>{JSON.stringify(diagnostics.versions,null,2)}</pre><button type="button" className="btn secondary" onClick={download}>Download Diagnostics</button></>}</Card>;
}
