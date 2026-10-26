import {lockPageScroll} from '../scroll-lock';
import {cardValue} from './ReportLoading';
import PageIcon, {pageIconForTitle} from './PageIcon';
import React, { useEffect, useState, useRef, useId } from 'react';
import { CheckCircle2, X } from 'lucide-react';

export function PageHeader({title, subtitle, actions}:{title:string; subtitle:string; actions?:React.ReactNode}) {
  return <div className="page-header"><div><h1><PageIcon name={pageIconForTitle(title)} className="page-title-icon"/>{title}</h1><p>{subtitle}</p></div><div className="header-actions">{actions}</div></div>
}

export function Card({children, className=''}:{children:React.ReactNode; className?:string}) {
  return <div className={`card ${className}`}>{children}</div>
}

export function Stat({label,value,sub,icon,reading}:{label:string;value:string|number;sub?:string;icon?:React.ReactNode;reading?:{loading?:boolean;error?:string;data?:any}}) {
  return <Card className="stat"><div><div className="muted small">{label}</div><div className="stat-value">{reading?cardValue(value,reading):value}</div>{sub && <div className="small positive">{sub}</div>}</div>{icon && <div className="stat-icon">{icon}</div>}</Card>
}

export function Badge({children,tone='green'}:{children:React.ReactNode;tone?:'green'|'red'|'yellow'|'blue'|'purple'|'gray'}) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Button({children,onClick,variant='primary',disabled=false}:{children:React.ReactNode;onClick?:()=>void;variant?:'primary'|'secondary'|'danger'|'ghost';disabled?:boolean}) {
  return <button className={`btn ${variant}`} onClick={onClick} disabled={disabled}>{children}</button>
}

export function Modal({open,onClose,title,children,success}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode;success?:string}) {
  const dialog=useRef<HTMLDivElement>(null),close=useRef(onClose),titleId=useId();close.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null,unlock=lockPageScroll();
    const focusable=()=>Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]).filter(el=>!el.closest('[hidden],[inert]')&&el.getAttribute('type')!=='hidden');
    const key=(event:KeyboardEvent)=>{
      const modals=document.querySelectorAll('.modal-backdrop');if(dialog.current?.parentElement!==modals[modals.length-1])return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key==='Tab'){const controls=focusable(),first=controls[0],last=controls.at(-1);if(!first){event.preventDefault();dialog.current?.focus();return;}if(event.shiftKey&&(document.activeElement===first||!dialog.current?.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.current?.contains(document.activeElement))){event.preventDefault();first.focus();}}
    };
    (focusable()[0]||dialog.current)?.focus({preventScroll:true});document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);unlock();if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[open]);
  if(!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}><div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><h3 id={titleId}>{title}</h3><button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></div>{success?<ConnectionSuccess message={success} onDone={onClose}/>:children}
  </div></div>
}

export function usePopupSuccess(open:boolean){
 const [success,setSuccess]=useState('');
 useEffect(()=>{if(!open)setSuccess('')},[open]);
 return [success,setSuccess] as const;
}

export const CONNECTION_SUCCESS_DELAY=2000;
export function ConnectionSuccess({message,onDone}:{message:string;onDone:()=>void}){
 const done=useRef(onDone),notice=useRef<HTMLDivElement>(null);done.current=onDone;
 useEffect(()=>{const timer=setTimeout(()=>done.current(),CONNECTION_SUCCESS_DELAY);notice.current?.focus({preventScroll:true});const modal=notice.current?.closest('.modal');if(modal)modal.scrollTop=0;return()=>clearTimeout(timer)},[message]);
 return <div ref={notice} tabIndex={-1} className="connection-success" role="status" aria-live="polite"><CheckCircle2 size={32} aria-hidden="true"/><strong>{message}</strong><small>Closing automatically…</small></div>;
}

export function Tabs({items,active,onChange}:{items:string[];active:string;onChange:(v:string)=>void}) {
  return <div className="tabs">{items.map(i=><button key={i} className={active===i?'tab active':'tab'} onClick={()=>onChange(i)}>{i}</button>)}</div>
}

export function Toast({message,onDone}:{message:string;onDone:()=>void}) {
  useEffect(()=>{const t=setTimeout(onDone,2500);return()=>clearTimeout(t)},[message]);
  return <div className="toast">{message}</div>
}

export function Progress({value}:{value:number}) {
  return <div className="progress"><div style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>
}
