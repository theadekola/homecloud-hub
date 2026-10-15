// Short-lived read coalescing only. Never use this for action validation.
export function createReadCache({ttl=2000,limit=128,now=Date.now}={}){
 const entries=new Map();let generation=0;
 return {
  clear(){generation++;entries.clear();},
  run(key,read,{force=false}={}){
   const previous=entries.get(key);
   if(previous?.pending)return previous.pending;
   if(!force&&previous&&now()-previous.time<ttl)return Promise.resolve(previous.value);
   if(entries.size>=limit){const idle=[...entries].find(([,row])=>!row.pending);if(idle)entries.delete(idle[0]);else return Promise.resolve().then(read);}
   const row={time:0},ticket=generation;
   const pending=Promise.resolve().then(read).then(value=>{
    if(ticket===generation&&entries.get(key)===row){if(value?.refreshing)entries.delete(key);else Object.assign(row,{value,time:now(),pending:null});}
    return value;
   },error=>{if(entries.get(key)===row)entries.delete(key);throw error;});
   row.pending=pending;entries.set(key,row);return pending;
  }
 };
}
