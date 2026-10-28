import ReportLoading from './ReportLoading';
import {useState,type ReactNode} from 'react';
export default function SSHFingerprintValue({fingerprint,pending,children,loading=false}:{fingerprint:string;pending:string;children?:ReactNode;loading?:boolean}){
 const [visible,setVisible]=useState(false);
 return <>{loading&&<ReportLoading message={pending}/>} {!loading&&<code>{fingerprint?(visible?fingerprint:'SHA256:••••••••••••••••'):pending}</code>}<div className="ssh-fingerprint-actions">{fingerprint&&<button type="button" className="btn secondary small" aria-expanded={visible} onClick={()=>setVisible(v=>!v)}>{visible?'Hide SSH fingerprint':'Show SSH fingerprint'}</button>}{children}</div></>;
}
