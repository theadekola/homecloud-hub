import {useEffect} from 'react';
import {Link} from 'react-router-dom';
import {Download,AlertTriangle} from 'lucide-react';
import {useApi} from '../hooks';

/** Keep an available update visible until the host confirms it is installed. */
export default function SoftwareUpdateNotice(){
 const live=useApi<any>('/updates',null,10000),status=live.data;
 useEffect(()=>{
  const refresh=()=>{void live.refresh()},visible=()=>{if(document.visibilityState==='visible')refresh()};
  window.addEventListener('iclusters-update-status',refresh);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('iclusters-update-status',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',visible)};
 },[live.refresh]);
 if(status?.pending||status?.state==='updating')return null;
 const available=!!status?.available,issue=!!live.error||status&&(status.enabled===false||['error','failed','unavailable'].includes(status.state));
 if(!available&&!issue)return null;
 const title=available?'Software update available':live.error?'Update status unavailable':'Software updater needs attention';
 const detail=live.error?'The latest update check could not be read. Open About to retry.':issue?status.message||'The updater could not complete its check. Open About to retry.':'A new i-Clusters update is ready to review and install.';
 return <aside className={`software-update-notice${issue?' warning':''}`} role={issue?'alert':'status'} aria-label={title}>
  {issue?<AlertTriangle size={22} aria-hidden="true"/>:<Download size={22} aria-hidden="true"/>}
  <div><strong>{title}</strong><p>{detail}</p></div>
  <Link className="btn secondary" to="/settings?tab=About">{available?'Review Update':'Check Updater'}</Link>
 </aside>;
}
