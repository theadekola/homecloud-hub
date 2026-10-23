/** Explain partial node coverage without suppressing successful readings. */
export default function NodeAvailability({data}:{data:any}){
 const nodes=data?.nodes||[],offline=nodes.filter((n:any)=>n.status!=='online'),partial=(data?.nodeCoverage||[]).filter((n:any)=>n.status==='partial');
 if(!offline.length&&!partial.length)return null;
 return <p className="muted" role="status">Showing available reports from {nodes.filter((n:any)=>n.status==='online').length}/{nodes.length} online nodes.
 {offline.length>0&&<> Unavailable: {offline.map((n:any)=>n.name||n.node).join(', ')}.</>}
 {partial.length>0&&<> Some sections are unavailable on {partial.map((n:any)=>n.node).join(', ')}.</>}
 {' '}Successful readings remain visible. Coverage updates automatically when nodes recover.</p>;
}
