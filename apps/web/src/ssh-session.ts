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

// Browser suspension is separate from user inactivity. Requests use keepalive so
// a visibility change can reach the server while mobile browsers freeze the page.
export function useShellPresence(id:string){
 useEffect(()=>{
  if(!id)return;
  let lastSent=0;
  const send=(presence:string)=>{lastSent=Date.now();void api(`/ssh/session/${id}`,{method:'POST',body:JSON.stringify({presence}),keepalive:true}).catch(()=>{});};
  const activity=()=>{if(!document.hidden&&Date.now()-lastSent>1000)send('active');};
  const visibility=()=>send(document.hidden?'hidden':'visible');
  const events=['pointerdown','keydown','wheel','touchstart'];
  events.forEach(event=>window.addEventListener(event,activity,{passive:true}));
  document.addEventListener('visibilitychange',visibility);
  window.addEventListener('pageshow',visibility);
  visibility();
  return()=>{events.forEach(event=>window.removeEventListener(event,activity));document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',visibility);};
 },[id]);
}
