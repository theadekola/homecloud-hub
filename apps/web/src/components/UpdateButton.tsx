import {useInstallationWakeLock} from '../installation-wake-lock';
import {Download,LoaderCircle} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
export default function UpdateButton({showLabel=false}:{showLabel?:boolean}){
 const [status,setStatus]=useState<any>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[statusError,setStatusError]=useState(''),[checking,setChecking]=useState(false),[transient,setTransient]=useState(false),[requested,setRequested]=useState(false);
 const started=useRef(false),previous=useRef(''),retry=useRef<()=>void>(()=>{}),check=useRef<{checkedAt:string;checkId?:string;time:number}|null>(null);
 const notice=(text:string,temporary=false)=>{setMessage(text);setTransient(temporary);};
 useEffect(()=>{if(!message||!transient)return;const timer=window.setTimeout(()=>setMessage(''),5000);return()=>window.clearTimeout(timer);},[message,transient]);
 useEffect(()=>{let active=true,inFlight=false;const poll=async()=>{if(inFlight)return;inFlight=true;setChecking(true);try{
  const result=await api('/updates');if(!active)return;setStatus(result);setStatusError('');
  if(started.current&&result.current!==previous.current&&['ready','completed'].includes(result.state)){window.location.reload();return;}
  if(check.current){
   if(result.state!=='checking'&&!result.checking&&(check.current.checkId&&result.checkId?result.checkId===check.current.checkId:result.checkedAt!==check.current.checkedAt)){check.current=null;setRequested(false);notice(result.state==='failed'?result.message:result.available?'A new update is available. Click the update button to install it.':result.message&&result.message!=='Up to date.'?result.message:'No new updates. i-Clusters is up to date.',result.state!=='failed');}
   else if(Date.now()-check.current.time>150000){check.current=null;setRequested(false);notice('The update check did not finish. Check the updater service and try again.');}
  }
  if(result.state==='failed'){started.current=false;setBusy(false);if(!check.current)notice(result.message);}
  else if(started.current&&!result.pending&&result.state!=='updating'){started.current=false;setBusy(false);notice(result.message,true);}
 }catch(e:any){if(active&&check.current&&Date.now()-check.current.time>150000){check.current=null;setRequested(false);notice('The update check did not finish. Check the updater service and try again.');}if(active&&!started.current)setStatusError(e.message||'Update status is unavailable. Retry the connection.');if(active&&started.current)notice('Updating… waiting for the server to reconnect.');}finally{inFlight=false;if(active)setChecking(false);}};
 retry.current=()=>{void poll()};void poll();const timer=window.setInterval(()=>{void poll()},requested?1000:10000);return()=>{active=false;window.clearInterval(timer);};},[requested]);
 const update=async()=>{notice('');setBusy(true);try{
  if(!status?.enabled){notice(status?.message||'Update service unavailable.');setBusy(false);return;}
  if(!status.available){const result=await api('/updates/check',{method:'POST'});check.current={checkedAt:result.checkedAt??status.checkedAt,checkId:result.checkId,time:Date.now()};notice('Checking GitHub for updates…');setRequested(true);setBusy(false);return;}
  previous.current=status.current;await api('/updates',{method:'POST'});started.current=true;notice('Update queued. The dashboard may briefly disconnect.');
 }catch(e:any){setBusy(false);notice(e.message);}};
 const running=busy||status?.pending||status?.state==='updating';
 const awake=useInstallationWakeLock(!!running);
 return <div className="software-update"><button type="button" className="btn secondary update-button" onClick={statusError?()=>retry.current():update} disabled={running||requested||checking||(!status&&!statusError)} aria-label={statusError?'Retry update status':running?'Updating software':requested?'Checking for software updates':status?.available?'Install software update':'Check for software updates'} title={status?.message||'Check for software updates'}>{running||requested?<LoaderCircle size={20} className="update-spinner" aria-hidden="true"/>:<Download size={20} aria-hidden="true"/>}{showLabel&&<span>{statusError?'Retry update status':running?'Updating…':requested?'Checking…':status?.available?'Install Update':'Check for Updates'}</span>}{status?.available&&<span className="update-dot" aria-label="New update available"/>}</button>{awake&&<span className="update-message" role="status">{awake}</span>}{statusError&&<span className="update-message error" role="alert">Update status unavailable: {statusError}</span>}{message&&<span className="update-message" role="status">{message}</span>}</div>;
}
