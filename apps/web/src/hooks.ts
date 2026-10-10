import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
let interval=30000;
export function configureRefresh(seconds:number){interval=Math.max(15,Math.min(300,seconds||30))*1000;window.dispatchEvent(new Event('homecloud-refresh'));}

export function useApi<T>(path: string, initial: T, refreshMs?:number) {
  const [data,setData] = useState<T>(initial);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const pending=useRef<AbortController|null>(null),generation=useRef(0);
  const refresh = useCallback(async()=>{
    if(pending.current)return;
    const controller=new AbortController(),ticket=++generation.current;pending.current=controller;
    try { setLoading(true); const result=await api<T>(path,{signal:controller.signal});if(ticket===generation.current){setData(result);setError('');} }
    catch(e:any){ if(ticket===generation.current&&!controller.signal.aborted)setError(e.message); } finally { if(ticket===generation.current){pending.current=null;setLoading(false);} }
  },[path]);
  useEffect(()=>{
    refresh();
    let timer=refreshMs===0?undefined:window.setInterval(refresh,refreshMs??interval);
    const reset=()=>{window.clearInterval(timer);timer=refreshMs===0?undefined:window.setInterval(refresh,refreshMs??interval);};
    window.addEventListener('homecloud-refresh',reset);
    window.addEventListener('homecloud-settings',refresh);
    window.addEventListener('homecloud-connection',refresh);
    return()=>{++generation.current;pending.current?.abort();pending.current=null;window.clearInterval(timer);window.removeEventListener('homecloud-refresh',reset);window.removeEventListener('homecloud-settings',refresh);window.removeEventListener('homecloud-connection',refresh);};
  },[refresh,refreshMs]);
  return {data,setData,loading,error,refresh};
}
