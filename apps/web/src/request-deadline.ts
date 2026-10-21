// Bound connection and response-body waits. Never retry a submitted mutation.
export async function waitForRequest<T>(work:Promise<T>,signal?:AbortSignal|null):Promise<T>{
 if(!signal)return work;
 let cancel:()=>void=()=>{};
 const aborted=new Promise<never>((_,reject)=>{cancel=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});});
 try{return await Promise.race([work,aborted]);}finally{signal.removeEventListener('abort',cancel);}
}
export async function requestWithDeadline<T>(url:string, options:RequestInit, consume:(response:Response)=>Promise<T>, timeoutMs=options.method&&!['GET','HEAD'].includes(options.method.toUpperCase())?120000:30000, streaming=false):Promise<T>{
 const controller=new AbortController();let timedOut=false,keepCancellation=false;
 const cancel=()=>controller.abort(options.signal?.reason);
 const release=()=>options.signal?.removeEventListener('abort',cancel);
 if(options.signal?.aborted)cancel();else options.signal?.addEventListener('abort',cancel,{once:true});
 let timer:ReturnType<typeof setTimeout>|undefined;
 const aborted=new Promise<never>((_,reject)=>{
  const fail=()=>reject(timedOut?new Error(options.method&&!['GET','HEAD'].includes(options.method.toUpperCase())?'Operation response timed out. The operation may still be running. Check its status before retrying.':'Request timed out. Check the connection and retry.'):controller.signal.reason||new DOMException('Aborted','AbortError'));
  if(controller.signal.aborted)fail();else controller.signal.addEventListener('abort',fail,{once:true});
  timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 });
 try{return await Promise.race([aborted,fetch(url,{...options,signal:controller.signal}).then(response=>{
  if(streaming&&response.ok&&response.body){
   const reader=response.body.getReader();keepCancellation=true;
   const body=new ReadableStream<Uint8Array>({async pull(stream){try{const result=await reader.read();if(result.done){release();stream.close()}else stream.enqueue(result.value)}catch(error){release();stream.error(error)}},async cancel(reason){release();await reader.cancel(reason)}});
   response=new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }
  return consume(response);
 })]);}
 finally{clearTimeout(timer);if(!keepCancellation||controller.signal.aborted)release();}
}
