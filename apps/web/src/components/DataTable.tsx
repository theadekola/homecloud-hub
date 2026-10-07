import React from 'react';
export function DataTable({columns,rows}:{columns:{key:string;label:string;render?:(row:any)=>React.ReactNode}[];rows:any[]}) {
  return <div className="table-wrap"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
  <tbody>{rows.map((r,i)=><tr key={r.id||i}>{columns.map(c=><td key={c.key}>{c.render?c.render(r):String(r[c.key]??'')}</td>)}</tr>)}</tbody></table></div>
}
