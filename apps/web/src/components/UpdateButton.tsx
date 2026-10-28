import {createPortal} from 'react-dom';
import {Modal} from './UI';
import {isSoftwareUpdating,setSoftwareUpdating,updatingMessage} from '../software-update-state';
import {useInstallationWakeLock} from '../installation-wake-lock';
import {Download,LoaderCircle} from 'lucide-react';
import {useEffect,useRef,useState} from 'react';
import {api} from '../api';
export default function UpdateButton({showLabel=false}:{showLabel?:boolean}){
 const [open,setOpen]=useState(false);
 const [status,setStatus]=useState<any>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[statusError,setStatusError]=useState(''),[checking,setChecking]=useState(false),[transient,setTransient]=useState(false),[requested,setRequested]=useState(false);
 const detected=useRef(''),started=useRef(false),previous=useRef(''),retry=useRef<()=>void>(()=>{}),check=useRef<{checkedAt:string;checkId?:string;time:number}|null>(null);
 const notice=(text:string,temporary=false)=>{setMessage(text);setTransient(temporary);};
 useEffect(()=>{if(!message||!transient)return;const timer=window.setTimeout(()=>setMessage(''),5000);return()=>window.clearTimeout(timer);},[message,transient]);
 useEffect(()=>{let active=true,inFlight=false;const poll=async()=>{if(inFlight)return;inFlight=true;setChecking(true);try{
  const result=await api('/updates');if(!active)return;setStatus(result);setStatusError('');if(result.available&&result.enabled&&result.state!=='checking'&&!result.checking){const release=result.latest||'available';if(detected.current!==release){detected.current=release;if(!check.current&&showLabel)notice('A new update is available. Open the update button to review it.',true);window.dispatchEvent(new Event('iclusters-update-status'));}}else if(!result.available)detected.current='';if(result.state==='failed'||result.state==='completed'&&!result.available){result.pending=false;setSoftwareUpdating(false)}else if(result.pending||result.state==='updating')setSoftwareUpdating(true);
  if(started.current&&result.current!==previous.current&&['ready','completed'].includes(result.state)){started.current=false;setBusy(false);setSoftwareUpdating(false);window.location.reload();return;}
  if(check.current){
   if(result.state!=='checking'&&!result.checking&&(check.current.checkId&&result.checkId?result.checkId===check.current.checkId:result.checkedAt!==check.current.checkedAt)){check.current=null;setRequested(false);notice(result.state==='failed'?result.message:result.available?'A new update is available. Open the update button to review it.':result.message&&result.message!=='Up to date.'?result.message:'No new updates. i-Clusters is up to date.',result.state!=='failed');}
   else if(Date.now()-check.current.time>150000){check.current=null;setRequested(false);notice('The update check did not finish. Check the updater service and try again.');}
  }
  if(result.state==='failed'){started.current=false;setBusy(false);if(!check.current)notice(result.message);}
  else if(started.current&&!result.pending&&result.state!=='updating'){started.current=false;setBusy(false);setSoftwareUpdating(false);notice(result.message,true);}
 }catch(e:any){if(active&&check.current&&Date.now()-check.current.time>150000){check.current=null;setRequested(false);notice('The update check did not finish. Check the updater service and try again.');}if(active&&isSoftwareUpdating()){setStatusError('');notice(updatingMessage)}else if(active){if(started.current){started.current=false;setBusy(false);setStatusError('The server has not reconnected. Check update progress on the host before retrying.');}else setStatusError(e.message||'Update status is unavailable. Retry the connection.');}}finally{inFlight=false;if(active)setChecking(false);}};
 retry.current=()=>{void poll()};void poll();const timer=window.setInterval(()=>{void poll()},requested?1000:10000);return()=>{active=false;window.clearInterval(timer);};},[requested,showLabel]);
 const update=async()=>{notice('');setBusy(true);try{
  if(!status?.enabled&&!status?.configured){notice(status?.message||'Update service unavailable.');setBusy(false);return;}
  if(!status.available||!status.enabled||['failed','error'].includes(status.state)){const result=await api('/updates/check',{method:'POST'});check.current={checkedAt:result.checkedAt??status.checkedAt,checkId:result.checkId,time:Date.now()};notice('Checking GitHub for updates…');setRequested(true);setBusy(false);return;}
  previous.current=status.current;started.current=true;setSoftwareUpdating(true);await api('/updates',{method:'POST'});notice('Update queued. i-Clusters will reconnect automatically when the server restarts.');
 }catch(e:any){if(e.updating){notice(updatingMessage);return}started.current=false;setSoftwareUpdating(false);setBusy(false);notice(e.message);}};
 const scanning=requested||status?.checking||status?.state==='checking';
 const running=busy||status?.pending||status?.state==='updating'||isSoftwareUpdating();
 const installable=status?.enabled&&status?.available&&!['failed','error'].includes(status?.state);
 const awake=useInstallationWakeLock(!!running);
 if(!open&&!showLabel&&!running&&(!status?.available||!status?.enabled||!!statusError))return null;
 return <div className="software-update"><button type="button" className="btn secondary update-button" onClick={()=>setOpen(true)} aria-busy={running||scanning} disabled={!status&&!statusError} aria-label={statusError?'Retry update status':running?'Updating software':scanning?'Checking for software updates':installable?'Review software update':'Check for software updates'} title={status?.message||'Check for software updates'}>{running||scanning?<LoaderCircle size={20} className="update-spinner" aria-hidden="true"/>:<Download size={20} aria-hidden="true"/>}{showLabel&&<span>{statusError?'Retry update status':running?'Updating…':scanning?'Checking…':installable?'Review Update':'Check for Updates'}</span>}{status?.available&&<span className="update-dot" aria-label="New update available"/>}</button>{open&&createPortal(<Modal open title="Software update" onClose={()=>setOpen(false)}><div className="software-update-review">
 <p>{running?'The update is in progress. This page reconnects automatically when the server restarts.':installable?'Review the available i-Clusters update, then install it below.':'Check the configured release branch for an i-Clusters update.'}</p>
 <dl><dt>Installed revision</dt><dd><code>{status?.current||'Not reported'}</code></dd><dt>Available revision</dt><dd><code>{status?.latest||'Not reported'}</code></dd>{status?.checkedAt&&Number.isFinite(Date.parse(status.checkedAt))&&<><dt>Last checked</dt><dd>{new Date(status.checkedAt).toLocaleString()}</dd></>}</dl>
 {!!status?.changes?.length&&<><h4>Update information</h4><ul>{status.changes.map((change:string,index:number)=><li key={index}>{change}</li>)}</ul></>}
 {!message&&status?.message&&<p>{status.message}</p>}
 {(running||scanning)&&<p role="status"><LoaderCircle className="update-spinner" size={20}/>{running?'Updating and waiting for reconnection…':'Checking for updates…'}</p>}
 {(statusError||message)&&<p role={statusError||status?.state==='failed'?'alert':'status'} className={statusError?'error':''}>{statusError||message}</p>}{awake&&<p className="muted">{awake}</p>}
 <div className="modal-actions"><button type="button" className="btn secondary" onClick={()=>setOpen(false)}>Close</button><button type="button" className="btn primary" aria-busy={running||scanning||checking} disabled={running||scanning||checking||(!status&&!statusError)} onClick={statusError?()=>retry.current():update}>{installable?'Update Software':statusError?'Retry update status':'Check for Updates'}</button></div>
 </div></Modal>,document.body)}</div>;
}
