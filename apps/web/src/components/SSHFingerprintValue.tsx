import {useState} from 'react';
export default function SSHFingerprintValue({fingerprint,pending}:{fingerprint:string;pending:string}){
 const [visible,setVisible]=useState(false);
 return <><code>{fingerprint?(visible?fingerprint:'SHA256:••••••••••••••••'):pending}</code>{fingerprint&&<button type="button" className="btn secondary small" aria-expanded={visible} onClick={()=>setVisible(v=>!v)}>{visible?'Hide SSH fingerprint':'Show SSH fingerprint'}</button>}</>;
}
