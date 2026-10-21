import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
let interval=30000;
export function configureRefresh(seconds:number){interval=Math.max(15,Math.min(300,seconds||30))*1000;window.dispatchEvent(new Event('homecloud-refresh'));}

type Resource={path:string;scope:string;data:any;hasData:boolean;error:string;loading:boolean;updated:number;created:number;generation:number;listeners:Set<()=>void>;pending?:Promise<void>;manualPending?:Promise<void>;forced?:boolean;controller?:AbortController};
const resources=new Map<string,Resource>();
let eventWindow:Window|undefined;
const identity=()=>{const token=window.sessionStorage.getItem('homecloud_access_token')||window.localStorage.getItem('homecloud_access_token')||'';try{const claim=JSON.parse(window.atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(typeof claim.sub==='string')return JSON.stringify([claim.sub,claim.role]);}catch{}return token};
const scope=()=>JSON.stringify([identity(),window.localStorage.getItem('homecloud_docker_host')||'']);
const emit=(entry:Resource)=>entry.listeners.forEach(notify=>notify());
function invalidate(){for(const entry of resources.values()){entry.updated=0;entry.generation++;entry.controller?.abort();entry.pending=undefined;entry.loading=false;emit(entry);}queueMicrotask(()=>{for(const entry of resources.values())if(entry.listeners.size&&entry.scope===scope())void load(entry,true,true);});}
function clear(){for(const entry of resources.values()){entry.generation++;entry.controller?.abort();entry.hasData=false;entry.data=undefined;entry.error='';entry.updated=0;entry.pending=undefined;entry.loading=false;emit(entry);}resources.clear();}
function refreshMatching(event:Event){const detail=(event as CustomEvent).detail;if(!Array.isArray(detail?.prefixes))return;for(const entry of resources.values())if(entry.listeners.size&&detail.prefixes.some((p:string)=>entry.path.split('?')[0]===p||entry.path.split('?')[0].startsWith(p+'/')))detail.requests.push(load(entry,true));}
function refreshSettings(){invalidate();for(const entry of resources.values())if(entry.listeners.size)void load(entry,true);}
function listen(){
 if(eventWindow===window)return;
 if(eventWindow){eventWindow.removeEventListener('homecloud-session-expired',clear);eventWindow.removeEventListener('homecloud-connection',clear);eventWindow.removeEventListener('homecloud-api-write',invalidate);eventWindow.removeEventListener('homecloud-settings',refreshSettings);eventWindow.removeEventListener('homecloud-resource-refresh',refreshMatching);clear();}
 eventWindow=window;window.addEventListener('homecloud-session-expired',clear);window.addEventListener('homecloud-connection',clear);window.addEventListener('homecloud-api-write',invalidate);window.addEventListener('homecloud-settings',refreshSettings);window.addEventListener('homecloud-resource-refresh',refreshMatching);
}
function resource(path:string){
 listen();const identity=scope(),key=JSON.stringify([identity,path]);let entry=resources.get(key);
 if(!entry){
  for(const [key,row] of resources)if(!row.listeners.size&&!row.pending&&(Date.now()-(row.updated||row.created)>300000||resources.size>=100))resources.delete(key);
  entry={path,scope:identity,data:undefined,hasData:false,error:'',loading:true,updated:0,created:Date.now(),generation:0,listeners:new Set()};resources.set(key,entry);
 }
 return entry;
}
function load(entry:Resource,force=false,background=false):Promise<void>{
 if(entry.pending){
  if(force&&!background&&!entry.forced){
   if(!entry.manualPending){const ticket=entry.generation;entry.manualPending=entry.pending.then(()=>{entry.manualPending=undefined;if(ticket!==entry.generation||entry.scope!==scope()||!entry.listeners.size)return;return load(entry,true,false)});}
   return entry.manualPending;
  }
  return entry.pending;
 }
 if(!force&&entry.hasData&&Date.now()-entry.updated<10000)return Promise.resolve();
 const controller=new AbortController(),ticket=++entry.generation;let timedOut=false;const timeout=window.setTimeout(()=>{timedOut=true;controller.abort();},30000);entry.controller=controller;entry.forced=force&&!background;entry.loading=true;
 const work=(async()=>{
  try{const result=await api(entry.path,{signal:controller.signal,...(force&&!background?{headers:{'X-HomeCloud-Refresh':'1'}}:{})});if(ticket===entry.generation&&entry.scope===scope()){entry.data=result;entry.hasData=true;entry.updated=Date.now();entry.error='';}}
  catch(e:any){if(ticket===entry.generation&&(!controller.signal.aborted||timedOut)){entry.error=timedOut?'Report request timed out. Check the connection and use Refresh to retry.':e.message;entry.updated=0;if(e.status===401||e.status===403){entry.hasData=false;entry.data=undefined;}}}
  finally{window.clearTimeout(timeout);if(ticket===entry.generation){entry.pending=undefined;entry.loading=false;emit(entry);}}
 })();entry.pending=work;emit(entry);return work;
}

export function useApi<T>(path: string, initial: T, refreshMs?:number|((data:T)=>number)) {
 const entry=resource(path),initialValue=useRef(initial),[,render]=useState(0);
 const refresh=useCallback(()=>load(entry,true),[entry]);
 const setData=useCallback((value:T|((previous:T)=>T))=>{entry.generation++;entry.controller?.abort();entry.pending=undefined;entry.loading=false;entry.data=typeof value==='function'?(value as (previous:T)=>T)(entry.hasData?entry.data:initialValue.current):value;entry.hasData=true;entry.updated=Date.now();entry.error='';emit(entry);},[entry]);
 useEffect(()=>{
  let timer:number|undefined,active=true;
  const schedule=()=>{window.clearTimeout(timer);if(!active)return;const configured=typeof refreshMs==='function'?refreshMs(entry.data):refreshMs;const delay=entry.data?.refreshing?1000:configured===0?0:configured??interval;if(delay)timer=window.setTimeout(()=>{void load(entry,true,true).then(schedule)},delay);};
  const notify=()=>{if(active){render(v=>v+1);schedule();}};entry.listeners.add(notify);void load(entry).then(schedule);schedule();
  window.addEventListener('homecloud-refresh',schedule);
  return()=>{active=false;entry.listeners.delete(notify);window.clearTimeout(timer);window.removeEventListener('homecloud-refresh',schedule);queueMicrotask(()=>{if(!entry.listeners.size&&entry.pending){entry.generation++;entry.controller?.abort();entry.pending=undefined;entry.loading=false;}});};
 },[entry,refreshMs]);
 return {data:(entry.hasData?entry.data:initialValue.current) as T,setData,loading:entry.loading,error:entry.error,refresh};
}

export async function refreshResources(prefixes:string[]){
 const detail={prefixes,requests:[] as Promise<void>[]};
 window.dispatchEvent(new CustomEvent('homecloud-resource-refresh',{detail}));
 await Promise.all(detail.requests);
}

// Clears only in-memory API reads, preserving credentials and browser preferences.
export function clearApiCache(){clear();}
