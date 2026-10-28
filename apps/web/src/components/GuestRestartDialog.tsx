import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Modal} from './UI';
import ReportLoading from './ReportLoading';
import {powerCycleGuest} from '../guest-power-cycle';
export default function GuestRestartDialog({node,id,kind='vm',name,onClose,onComplete,onBusy}:{node:string;id:string;kind?:'vm'|'lxc';name:string;onClose:()=>void;onComplete:()=>void;onBusy:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const checkpoint=useRef<{startRequested?:boolean}>({}),pending=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const restart=async()=>{if(pending.current)return;pending.current=true;setBusy(true);onBusy(true);setError('');controller.current=new AbortController();try{await powerCycleGuest(node,id,kind,setMessage,controller.current.signal,checkpoint.current);onComplete()}catch(e:any){if(!controller.current.signal.aborted)setError(e.message)}finally{pending.current=false;setBusy(false);onBusy(false)}};
 return createPortal(<Modal open title={`Restart ${kind==='vm'?'VM':'CT'} · ${name}`} onClose={onClose} closeDisabled={busy}>
 <p>Setup is installed. A full shutdown and start is required to activate the guest channel on <b>{name}</b> ({node} / {id}). This interrupts services in this guest.</p><p>Continue to shut down safely, wait until it is stopped, then start it and verify access. The existing SSH approval protects power actions.</p>
 {busy&&<p role="status"><ReportLoading message={message||'Preparing restart…'}/></p>}{error&&<p role="alert" className="error">{error}</p>}
 <div className="modal-actions"><button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Later</button><button type="button" className="btn primary" disabled={busy} aria-busy={busy} onClick={restart}>Shutdown, Start &amp; Verify</button></div>
 </Modal>,document.body);
}
