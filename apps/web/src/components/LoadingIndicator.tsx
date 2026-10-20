import {useEffect,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
export default function LoadingIndicator(){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{let timer:number|undefined;const update=(event:Event)=>{window.clearTimeout(timer);if((event as CustomEvent).detail>0)timer=window.setTimeout(()=>setVisible(true),200);else setVisible(false)};window.addEventListener('homecloud-network-loading',update);return()=>{window.clearTimeout(timer);window.removeEventListener('homecloud-network-loading',update)}},[]);
 return visible?<div className="network-loading" role="status"><LoaderCircle className="spin" size={17}/><span>Loading…</span></div>:null;
}
