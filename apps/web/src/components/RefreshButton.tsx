import {useEffect,useRef,useState,type ButtonHTMLAttributes,type MouseEvent} from 'react';
import {RefreshCw} from 'lucide-react';

type Props=Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onClick'> & {
 onClick?:(event:MouseEvent<HTMLButtonElement>)=>unknown;
 indicator?:boolean;
};
/** Keep a refresh visibly busy for the whole request and prevent duplicate clicks. */
export default function RefreshButton({onClick,disabled,children,className='',indicator=false,type='button',...props}:Props){
 const [waiting,setWaiting]=useState(false),[running,setRunning]=useState(false),sequence=useRef(0),[failure,setFailure]=useState(''),active=useRef(true),pending=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 const external=props['aria-busy']===true||props['aria-busy']==='true',busy=running||external;
 const refresh=async(event:MouseEvent<HTMLButtonElement>)=>{
  if(pending.current||disabled||external)return;
  pending.current=true;setRunning(true);setWaiting(true);setFailure('');const started=Date.now(),ticket=++sequence.current;
  try{await onClick?.(event)}catch(error:any){if(active.current)setFailure(error?.message||'Refresh failed. Please retry.')}
  finally{pending.current=false;if(active.current)setRunning(false);const remaining=350-(Date.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));if(active.current&&sequence.current===ticket)setWaiting(false)}
 };
 return <><button {...props} type={type} className={`refresh-button ${className}`} aria-busy={busy} data-refreshing={waiting||busy} disabled={disabled||busy} onClick={refresh}>{indicator&&<RefreshCw size={16} aria-hidden="true"/>}{children}</button>{failure&&<span className="refresh-button-error" role="alert">{failure}</span>}</>;
}
