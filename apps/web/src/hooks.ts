import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
let interval=30000;
export function configureRefresh(seconds:number){interval=Math.max(15,Math.min(300,seconds||30))*1000;window.dispatchEvent(new Event('homecloud-refresh'));}

export function useApi<T>(path: string, initial: T, refreshMs?:number) {
  const [data,setData] = useState<T>(initial);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const refresh = useCallback(async()=>{
    try { setLoading(true); setData(await api<T>(path)); setError(''); }
    catch(e:any){ setError(e.message); } finally { setLoading(false); }
  },[path]);
  useEffect(()=>{
    refresh();
    let timer=refreshMs===0?undefined:window.setInterval(refresh,refreshMs??interval);
    const reset=()=>{window.clearInterval(timer);timer=refreshMs===0?undefined:window.setInterval(refresh,refreshMs??interval);};
    window.addEventListener('homecloud-refresh',reset);
    window.addEventListener('homecloud-settings',refresh);
    window.addEventListener('homecloud-connection',refresh);
    return()=>{window.clearInterval(timer);window.removeEventListener('homecloud-refresh',reset);window.removeEventListener('homecloud-settings',refresh);window.removeEventListener('homecloud-connection',refresh);};
  },[refresh,refreshMs]);
  return {data,setData,loading,error,refresh};
}
