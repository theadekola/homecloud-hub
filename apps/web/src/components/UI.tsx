import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function PageHeader({title, subtitle, actions}:{title:string; subtitle:string; actions?:React.ReactNode}) {
  return <div className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="header-actions">{actions}</div></div>
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
  if(!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}
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
