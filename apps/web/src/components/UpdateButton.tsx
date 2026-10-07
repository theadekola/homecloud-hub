import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
export default function UpdateButton(){
 const [status,setStatus]=useState<any>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const started=useRef(false),previous=useRef('');
 useEffect(()=>{let active=true;const poll=async()=>{try{const result=await api('/updates');if(!active)return;setStatus(result);if(started.current&&result.current!==previous.current&&result.state==='completed'){window.location.reload();return;}if(result.state==='failed'){started.current=false;setBusy(false);setMessage(result.message);}else if(started.current&&!result.pending&&result.state!=='updating'){started.current=false;setBusy(false);setMessage(result.message);}}catch{if(active&&started.current)setMessage('Updating… waiting for the server to reconnect.');}};poll();const timer=setInterval(poll,10000);return()=>{active=false;clearInterval(timer);};},[]);
 const update=async()=>{setMessage('');setBusy(true);try{previous.current=status.current;await api('/updates',{method:'POST'});started.current=true;setMessage('Update queued. The dashboard may briefly disconnect.');}catch(e:any){setBusy(false);setMessage(e.message);}};
 const running=busy||status?.pending||status?.state==='updating';
 return <div className="software-update"><button className="btn secondary update-button" onClick={update} disabled={running||!status?.enabled||!status?.available} title={status?.message||'Checking for updates…'}>{running?'Updating…':'Update'}{status?.available&&<span className="update-dot" aria-label="New update available"/>}</button>{message&&<span className="update-message" role="status">{message}</span>}</div>;
}
