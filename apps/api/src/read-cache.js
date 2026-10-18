// Short-lived read coalescing only. Never use this for action validation.
export function createReadCache({ttl=2000,limit=128,staleMs=30000,now=Date.now}={}){
 const entries=new Map();let generation=0;
 return {
  clear(){generation++;entries.clear();},
  run(key,read,{force=false,background=false}={}){
   const previous=entries.get(key);
   const stale=background&&!force&&previous?.value&&typeof previous.value==='object'&&now()-previous.time<staleMs;
   if(previous?.pending)return stale?Promise.resolve({...previous.value,refreshing:true}):previous.pending;
   if(!force&&previous&&now()-previous.time<ttl)return Promise.resolve(previous.value);
   if(entries.size>=limit){const idle=[...entries].find(([,row])=>!row.pending);if(idle)entries.delete(idle[0]);else return Promise.resolve().then(read);}
   const row={...(stale?{value:previous.value,time:previous.time}:{time:0})},ticket=generation;
   const pending=Promise.resolve().then(read).then(value=>{
    if(ticket===generation&&entries.get(key)===row){if(value?.refreshing)entries.delete(key);else Object.assign(row,{value,time:now(),pending:null});}
    return value;
   },error=>{if(entries.get(key)===row)entries.delete(key);throw error;});
   row.pending=pending;entries.set(key,row);if(stale){void pending.catch(()=>{});return Promise.resolve({...previous.value,refreshing:true});}return pending;
  }
 };
}
