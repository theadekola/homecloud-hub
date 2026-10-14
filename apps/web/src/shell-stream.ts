import {sendShellInput} from './ssh-transfer';
// Parse complete frames only, preserving UTF-8 split across network packets.
export async function readShellOutput(response:Response,onFrame:(frame:{output:string;closed:boolean})=>void){
 if(!response.body)throw Error('Terminal streaming is unavailable.');
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
 try{for(;;){const {value,done}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});if(pending.length>1048576)throw Error('Terminal output frame is too large.');let at;while((at=pending.indexOf('\n'))!==-1){const line=pending.slice(0,at);pending=pending.slice(at+1);if(!line)continue;const frame=JSON.parse(line);if(typeof frame.output!=='string'||typeof frame.closed!=='boolean')throw Error('Invalid terminal output frame');onFrame(frame);}if(done){if(pending)throw Error('Terminal output was interrupted.');return;}}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
// Group input received during an in-flight request instead of making every key
// wait for its own round trip. No input is retried after an uncertain failure.
export function shellInputQueue(send:(chunk:string)=>Promise<any>,onError:(error:any)=>void){
 let pending='',sending=false,stopped=false;
 const flush=async()=>{if(sending||stopped)return;sending=true;try{while(pending&&!stopped){const text=pending;pending='';await sendShellInput(text,chunk=>stopped?Promise.resolve():send(chunk));}}catch(error){pending='';stopped=true;onError(error)}finally{sending=false}};
 return {push(text:string){if(stopped)return;if(pending.length+text.length>1048576){pending='';stopped=true;onError(Error('Terminal input queue is full. Reconnect before typing again.'));return;}pending+=text;void flush();},stop(){stopped=true;pending='';}};
}
