// Bound connection and response-body waits. Never retry a submitted mutation.
export async function requestWithDeadline<T>(url:string, options:RequestInit, consume:(response:Response)=>Promise<T>, timeoutMs=options.method&&!['GET','HEAD'].includes(options.method.toUpperCase())?120000:30000):Promise<T>{
 const controller=new AbortController();let timedOut=false;
 const cancel=()=>controller.abort(options.signal?.reason);
 if(options.signal?.aborted)cancel();else options.signal?.addEventListener('abort',cancel,{once:true});
 let timer:ReturnType<typeof setTimeout>|undefined;
 const aborted=new Promise<never>((_,reject)=>{
  const fail=()=>reject(timedOut?new Error(options.method&&!['GET','HEAD'].includes(options.method.toUpperCase())?'Operation response timed out. The operation may still be running. Check its status before retrying.':'Request timed out. Check the connection and retry.'):controller.signal.reason||new DOMException('Aborted','AbortError'));
  if(controller.signal.aborted)fail();else controller.signal.addEventListener('abort',fail,{once:true});
  timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 });
 try{return await Promise.race([aborted,fetch(url,{...options,signal:controller.signal}).then(consume)]);}
 finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
}
