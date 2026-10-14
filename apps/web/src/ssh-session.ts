import {useEffect} from 'react';
import {api} from './api';
const owners=new Map<string,{count:number;timer?:ReturnType<typeof setTimeout>}>();
// Defer final release so React's development effect replay can retain the session.
export function retainSSHSession(id:string){
 let entry=owners.get(id);
 if(!entry){entry={count:0};owners.set(id,entry);}
 clearTimeout(entry.timer);entry.count++;
 let released=false;
 return ()=>{
  if(released)return;released=true;
  if(--entry!.count===0)entry!.timer=setTimeout(()=>{
   if(entry!.count===0){owners.delete(id);api(`/ssh/session/${id}`,{method:'DELETE'}).catch(()=>{});}
  },0);
 };
}
export function useSSHSession(id:string){useEffect(()=>id?retainSSHSession(id):undefined,[id]);}
