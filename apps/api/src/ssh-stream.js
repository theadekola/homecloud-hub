// Renew each stream regularly so normal HTTP authentication and account roles
// are rechecked. Only one output consumer may drain a shell at a time.
export function streamShellOutput(req,res,session,{lifetime=15000,maxPending=1048576}={}){
 session.releaseOutput?.();
 let ended=false;
 res.setHeader('Content-Type','application/x-ndjson');
 res.setHeader('Cache-Control','no-store, no-transform');
 res.setHeader('X-Accel-Buffering','no');
 res.flushHeaders();
 const cleanup=()=>{if(ended)return;ended=true;clearTimeout(timer);res.off('close',cleanup);if(session.releaseOutput===finish){session.releaseOutput=null;session.onOutput=null;}};
 const finish=()=>{cleanup();if(!res.destroyed)res.end();};
 const flush=()=>{
  if(ended)return;
  if(res.destroyed||res.writableEnded){cleanup();return;}
  if(res.writableLength>maxPending){cleanup();res.destroy();return;}
  const output=session.output;session.output='';
  if(output||session.closed)res.write(JSON.stringify({output,closed:session.closed})+'\n');
  if(session.closed)finish();
 };
 const timer=setTimeout(finish,lifetime);timer.unref?.();
 session.releaseOutput=finish;session.onOutput=flush;res.on('close',cleanup);
 flush();return finish;
}
