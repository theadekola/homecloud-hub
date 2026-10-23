export function topologyPercent(value:any){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100?`${value.toFixed(0)}%`:'Unavailable';}
export function topologyState(resource:any,parent?:string){if(parent&&parent!=='online'||resource.nodeAvailable===false)return 'unknown';if(['online','running'].includes(resource.status))return resource.status;if(['offline','stopped','paused','suspended'].includes(resource.status))return resource.status;return 'unknown';}
export function clusterTopology(data:any,search=''){
 const nodes=new Map<string,any>(),guests=new Map<string,any>();
 for(const node of data?.nodes||[]){const name=node.name||node.node;if(name)nodes.set(name,{...node,name,kind:'node',guests:[]});}
 for(const [kind,rows] of [['qemu',data?.vms||[]],['lxc',data?.lxc||[]]] as const){for(const row of rows){if(!row.node||row.id==null)continue;const key=`${row.node}:${kind}:${row.id}`;guests.set(key,{...row,kind,key});if(!nodes.has(row.node))nodes.set(row.node,{name:row.node,kind:'node',status:'unknown',guests:[]});}}
 for(const guest of guests.values())nodes.get(guest.node).guests.push(guest);
 const query=search.trim().toLowerCase();
 const matches=(r:any)=>`${r.name} ${r.id??''} ${r.kind==='lxc'?'ct container':r.kind==='qemu'?'vm virtual machine':'node'} ${r.ip||''}`.toLowerCase().includes(query);
 const result=[...nodes.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(node=>({...node,guests:node.guests.filter((g:any)=>!query||matches(node)||matches(g)).sort((a:any,b:any)=>String(a.id).localeCompare(String(b.id),undefined,{numeric:true}))})).filter(node=>!query||matches(node)||node.guests.length);
 return {name:data?.clusterStatus?.find((r:any)=>r.type==='cluster')?.name||'Connected infrastructure',nodes:result};
}
