import PageIcon, {pageIconForTitle} from './PageIcon';
import React, { useEffect, useState, useRef, useId } from 'react';
import { X } from 'lucide-react';

export function PageHeader({title, subtitle, actions}:{title:string; subtitle:string; actions?:React.ReactNode}) {
  return <div className="page-header"><div><h1><PageIcon name={pageIconForTitle(title)} className="page-title-icon"/>{title}</h1><p>{subtitle}</p></div><div className="header-actions">{actions}</div></div>
}

export function Card({children, className=''}:{children:React.ReactNode; className?:string}) {
  return <div className={`card ${className}`}>{children}</div>
}

export function Stat({label,value,sub,icon}:{label:string;value:string|number;sub?:string;icon?:React.ReactNode}) {
  return <Card className="stat"><div><div className="muted small">{label}</div><div className="stat-value">{value}</div>{sub && <div className="small positive">{sub}</div>}</div>{icon && <div className="stat-icon">{icon}</div>}</Card>
}

export function Badge({children,tone='green'}:{children:React.ReactNode;tone?:'green'|'red'|'yellow'|'blue'|'purple'|'gray'}) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function Button({children,onClick,variant='primary',disabled=false}:{children:React.ReactNode;onClick?:()=>void;variant?:'primary'|'secondary'|'danger'|'ghost';disabled?:boolean}) {
  return <button className={`btn ${variant}`} onClick={onClick} disabled={disabled}>{children}</button>
}

export function Modal({open,onClose,title,children}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode}) {
  const dialog=useRef<HTMLDivElement>(null),close=useRef(onClose),titleId=useId();close.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]).filter(el=>!el.hidden&&el.getAttribute('type')!=='hidden');
    const key=(event:KeyboardEvent)=>{
      const modals=document.querySelectorAll('.modal-backdrop');if(dialog.current?.parentElement!==modals[modals.length-1])return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key==='Tab'){const controls=focusable(),first=controls[0],last=controls.at(-1);if(!first){event.preventDefault();dialog.current?.focus();return;}if(event.shiftKey&&(document.activeElement===first||!dialog.current?.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.current?.contains(document.activeElement))){event.preventDefault();first.focus();}}
    };
    (focusable()[0]||dialog.current)?.focus();document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
  },[open]);
  if(!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}><div ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><h3 id={titleId}>{title}</h3><button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}><X size={18}/></button></div>{children}
  </div></div>
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
