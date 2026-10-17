import {useEffect,useRef,useState} from 'react';

// Bind a dialog to the provider resource and filesystem path that opened it.
export function storageTargetKey(resource:any){return resource?JSON.stringify([resource.id,resource.resourceId,resource.provider,resource.protocol,resource.path??resource.mountpoint]):'';}
export function useStorageDialog(resource:any,notify:(message:string)=>void){
 const [modal,setModal]=useState(''),[target,setTarget]=useState<any>(null),[extra,setExtra]=useState<any>(null),[error,setError]=useState(''),[reading,setReading]=useState(false),[success,setSuccess]=useState('');
 const generation=useRef(0),controller=useRef<AbortController|null>(null),currentKey=useRef('');currentKey.current=storageTargetKey(resource);
 const cancel=()=>{generation.current++;controller.current?.abort();controller.current=null;};
 const close=()=>{setSuccess('');cancel();setModal('');setTarget(null);setExtra(null);setError('');setReading(false);};
 const open=(name:string,bound=true)=>{setSuccess('');cancel();setTarget(bound&&resource?{...resource}:null);setModal(name);setExtra(null);setError('');setReading(false);};
 const valid=()=>!!target&&storageTargetKey(target)===currentKey.current;
 useEffect(()=>{if(modal&&!success&&target&&!valid()){close();notify('The selected resource changed or is no longer available. Select it again before continuing.');}},[modal,success,target,storageTargetKey(resource),notify]);
 useEffect(()=>()=>cancel(),[]);
 const read=async(name:string,request:(target:any,signal:AbortSignal)=>Promise<any>)=>{
  if(!resource)return;open(name);const ticket=generation.current,next=new AbortController();controller.current=next;setReading(true);
  try{const result=await request(resource,next.signal);if(ticket===generation.current&&!next.signal.aborted)setExtra(result);}
  catch(e:any){if(ticket===generation.current&&!next.signal.aborted)setError(e.message);}
  finally{if(ticket===generation.current)setReading(false);}
 };
 return {success,succeed:setSuccess,modal,target,extra,error,setError,reading,open,close,read,valid};
}
