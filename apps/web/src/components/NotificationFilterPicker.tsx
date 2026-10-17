import {useRef,useEffect} from 'react';
const kinds=[['critical','Critical'],['warning','Warning'],['info','Info'],['resolved','Recoveries'],['unknown','Unknown severity']];
export default function NotificationFilterPicker({label,value,disabled,onChange}:{label:string;value:string;disabled:boolean;onChange:(value:string)=>void}){
 const selected=value==='all'?kinds.map(([key])=>key):value.split(',').filter(Boolean),all=selected.length===kinds.length,partial=selected.length>0&&!all,allBox=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(allBox.current)allBox.current.indeterminate=partial},[partial]);
 const update=(next:string[])=>onChange(next.length===kinds.length?'all':kinds.map(([key])=>key).filter(key=>next.includes(key)).join(','));
 return <fieldset aria-label={label} className="notification-filter-picker" disabled={disabled}><legend>{label} *</legend><label className="notification-filter-all"><input ref={allBox} type="checkbox" checked={all} onChange={e=>update(e.target.checked?kinds.map(([key])=>key):[])}/>All severities and recoveries</label><div className="notification-filter-options">{kinds.map(([key,name])=><label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={e=>update(e.target.checked?[...selected,key]:selected.filter(k=>k!==key))}/>{name}</label>)}</div><small>Choose one or more. Metric recoveries are selected separately from active alert severity. Connection recoveries always notify configured, enabled channels.</small></fieldset>;
}
