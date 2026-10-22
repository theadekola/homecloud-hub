import {useEffect,useRef,useState} from 'react';
import {Modal} from './UI';
type Request={phrase:string;path:string;description?:string;resolve:(value:string)=>void;reject:(error:Error)=>void;serial:number};
export default function ActionConfirmation(){
 const [request,setRequest]=useState<Request|null>(null),complete=useRef<(value?:string)=>void>(()=>{});
 useEffect(()=>{
  let active:Request|null=null,serial=0;const pending:Request[]=[];
  const next=()=>{if(active||!pending.length)return;active=pending.shift()!;setRequest(active)};
  complete.current=value=>{if(!active||value!==undefined&&value!==active.phrase)return;const current=active;active=null;setRequest(null);value===undefined?current.reject(new Error('Confirmation cancelled')):current.resolve(value);next()};
  const receive=(event:Event)=>{const detail=(event as CustomEvent).detail;pending.push({...detail,serial:++serial});next()};
  window.addEventListener('homecloud-action-confirmation',receive);
  return()=>{window.removeEventListener('homecloud-action-confirmation',receive);active?.reject(new Error('Confirmation cancelled'));for(const item of pending)item.reject(new Error('Confirmation cancelled'))};
 },[]);
 return <Modal open={!!request} title={request?.path.match(/^\/operations\/[^/]+\/tools$/)?'Install Monitoring Tools':'Confirm Action'} onClose={()=>complete.current()}>{request&&<ConfirmationForm key={request.serial} request={request} complete={value=>complete.current(value)}/>}</Modal>;
}
function ConfirmationForm({request,complete}:{request:Request;complete:(value?:string)=>void}){
 const [value,setValue]=useState('');
 return <form className="ssh-connection-form" onSubmit={event=>{event.preventDefault();if(value===request.phrase)complete(value)}}>
  <div className="permission-help"><p>{request.description||'Review this host action before continuing.'}</p>{request.path.match(/^\/operations\/[^/]+\/tools$/)&&<p>Install the supported monitoring tools on the selected host. This changes host packages and may take several minutes.</p>}<p className="muted" style={{overflowWrap:'anywhere'}}>Target action: {request.path}</p></div>
  <p>Type the following confirmation exactly:</p><code style={{display:'block',whiteSpace:'pre-wrap',overflowWrap:'anywhere',userSelect:'text'}}>{request.phrase}</code>
  <label>Confirmation<input value={value} onInput={event=>setValue(event.currentTarget.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} required/></label>
  <div className="header-actions"><button type="button" className="btn secondary" onClick={()=>complete()}>Cancel</button><button type="submit" className="btn primary" disabled={value!==request.phrase}>Confirm</button></div>
 </form>;
}
