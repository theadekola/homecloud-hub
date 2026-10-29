import React from 'react';
import {InspectableRow} from './TableActions';
export function DataTable({columns,rows,onInspect,rowLabel}:{columns:{key:string;label:string;render?:(row:any)=>React.ReactNode}[];rows:any[];onInspect?:(row:any)=>void;rowLabel?:(row:any)=>string}) {
  return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
  <tbody>{rows.map((r,i)=>onInspect?<InspectableRow key={r.id||i} onInspect={()=>onInspect(r)} aria-label={rowLabel?.(r)}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):String(r[c.key]??'')}</td>)}</InspectableRow>:<tr key={r.id||i}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):String(r[c.key]??'')}</td>)}</tr>)}</tbody></table></div>
}
