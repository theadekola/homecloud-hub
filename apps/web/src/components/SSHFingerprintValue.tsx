import ReportLoading from './ReportLoading';
import {Eye,EyeOff,RefreshCw} from 'lucide-react';
import {useState,type ReactNode} from 'react';
export default function SSHFingerprintValue({fingerprint,pending,children,loading=false,onRetry,retryDisabled=false}:{fingerprint:string;pending:string;children?:ReactNode;loading?:boolean;onRetry?:()=>void;retryDisabled?:boolean}){
 const [visible,setVisible]=useState(false),label=visible?'Hide SSH fingerprint':'Show SSH fingerprint';
 return <><div className="ssh-fingerprint-heading"><b>Verify SSH host identity</b>{fingerprint&&<button type="button" className="icon-btn" aria-label={label} title={label} aria-expanded={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button>}{!fingerprint&&onRetry&&<button type="button" className="icon-btn" aria-label="Retry SSH fingerprint" title="Retry SSH fingerprint" disabled={retryDisabled||loading} onClick={onRetry}><RefreshCw size={18}/></button>}</div>{loading?<ReportLoading message={pending}/>:<code>{fingerprint?(visible?fingerprint:'SHA256:••••••••••••••••'):pending}</code>}<div className="ssh-fingerprint-verification">{children}</div></>;
}
