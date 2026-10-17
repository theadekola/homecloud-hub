import type {ReactNode} from 'react';

type Props={
 total:number;
 page:number;
 pageSize:number;
 onPageChange:(page:number)=>void;
 onPageSizeChange:(size:number)=>void;
 label:string;
 className?:string;
 pageSizeLabel?:string;
 previousLabel?:string;
 nextLabel?:string;
 disabled?:boolean;
 children?:ReactNode;
};

export default function Pagination({total,page,pageSize,onPageChange,onPageSizeChange,label,className='',pageSizeLabel,previousLabel,nextLabel,disabled=false,children}:Props){
 const pages=Math.max(1,Math.ceil(total/pageSize)),current=Math.max(0,Math.min(page,pages-1));
 const sizes=Array.from(new Set([10,25,50,pageSize])).sort((a,b)=>a-b);
 return <div className={`table-pagination ${className}`}>
  <nav className="table-pagination-controls" aria-label={`${label} pagination`}>
   <small className="table-pagination-range" aria-live="polite">Showing {total?current*pageSize+1:0}–{Math.min((current+1)*pageSize,total)} of {total}</small>
   <button type="button" className="btn secondary small table-pagination-previous" aria-label={previousLabel||`Previous ${label.toLowerCase()} page`} disabled={disabled||current===0} onClick={()=>onPageChange(current-1)}>Previous</button>
   <b className="table-pagination-position" aria-label={`Page ${current+1} of ${pages}`}>{current+1} / {pages}</b>
   <button type="button" className="btn secondary small table-pagination-next" aria-label={nextLabel||`Next ${label.toLowerCase()} page`} disabled={disabled||current+1>=pages} onClick={()=>onPageChange(current+1)}>Next</button>
   <select className="table-pagination-size" aria-label={pageSizeLabel||`${label} per page`} value={pageSize} disabled={disabled} onChange={event=>{onPageSizeChange(Number(event.target.value));onPageChange(0)}}>{sizes.map(size=><option key={size} value={size}>{size} / page</option>)}</select>
  </nav>
  {children&&<div className="table-pagination-actions">{children}</div>}
 </div>;
}
