// Optional guest-agent readings must not gate node/VM inventory.
export function createGuestFilesystemReader(parse,{budget=250,ttl=30000}={}){
 const connections=new Map();
 return async(guests,query,identity)=>{
  let state=connections.get(identity);
  if(!state){state={values:new Map(),time:0,pending:null};connections.set(identity,state);if(connections.size>16)connections.delete(connections.keys().next().value);}
  if(!state.pending&&Date.now()-state.time>=ttl){
   const active=new Set(guests.map(g=>`${g.node}/${g.vmid}`));for(const key of state.values.keys())if(!active.has(key))state.values.delete(key);
   state.pending=(async()=>{
    let index=0;const worker=async()=>{while(index<guests.length){const guest=guests[index++],key=`${guest.node}/${guest.vmid}`;try{const data=await query(`/nodes/${encodeURIComponent(guest.node)}/qemu/${encodeURIComponent(guest.vmid)}/agent/get-fsinfo`,{timeoutMs:5000});state.values.set(key,parse(data));}catch{state.values.delete(key);}}};
    await Promise.all(Array.from({length:Math.min(4,guests.length)},worker));state.time=Date.now();
   })().finally(()=>{state.pending=null;});
  }
  if(state.pending){let timer;await Promise.race([state.pending,new Promise(resolve=>{timer=setTimeout(resolve,budget)})]).finally(()=>clearTimeout(timer));}
  return new Map(guests.map(g=>[String(g.vmid),state.values.get(`${g.node}/${g.vmid}`)]));
 };
}
