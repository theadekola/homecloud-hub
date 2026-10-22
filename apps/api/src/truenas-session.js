import fs from 'node:fs';
import WebSocket from 'ws';
// A report authenticates once. Parallel one-request sockets can exhaust provider login/session limits.
export function readTrueNASBatch(calls,env,{WebSocketImpl=WebSocket,timeoutMs=15000}={}){
 if(!Array.isArray(calls)||!calls.length||calls.length>16)throw Error('Invalid TrueNAS report batch');
 const base=new URL(env.TRUENAS_URL);if(base.protocol!=='https:')throw Error('TrueNAS requires an HTTPS URL');
 const legacy=env.TRUENAS_API_MODE==='legacy',target=new URL(env.TRUENAS_WS_PATH||(legacy?'/websocket':'/api/current'),base);target.protocol='wss:';
 return new Promise((resolve,reject)=>{
  const ws=new WebSocketImpl(target,{ca:env.TRUENAS_CA_PEM||(env.TRUENAS_TLS_CA?fs.readFileSync(env.TRUENAS_TLS_CA):undefined),rejectUnauthorized:true,maxPayload:32*1024*1024});
  let closed=false,authenticated=false,index=0,timer,retried=false;const results=[];
  const finish=error=>{if(closed)return;closed=true;clearTimeout(timer);ws.close();if(error&&!authenticated)return reject(error);if(error)while(results.length<calls.length)results.push({error});resolve(results)};
  const deadline=()=>{clearTimeout(timer);timer=setTimeout(()=>{finish(Object.assign(Error('TrueNAS request timed out'),{code:'ETIMEDOUT'}));ws.terminate()},timeoutMs)};
  const send=(id,method,params)=>{deadline();ws.send(JSON.stringify(legacy?{msg:'method',id:String(id),method,params}:{jsonrpc:'2.0',id,method,params}))};
  const next=()=>{if(index===calls.length)return finish();retried=false;const [method,params=[]]=calls[index];send(index+2,legacy?method.replace('pool.snapshot.','zfs.snapshot.'):method,params)};
  const auth=()=>send(1,'auth.login_with_api_key',[env.TRUENAS_API_KEY]);
  deadline();ws.on('open',()=>{if(legacy)ws.send(JSON.stringify({msg:'connect',version:'1',support:['1']}));else auth()});
  ws.on('unexpected-response',(_req,res)=>{res.resume();finish(Object.assign(Error('TrueNAS WebSocket upgrade rejected'),{providerStatus:res.statusCode}))});
  ws.on('error',finish);ws.on('close',()=>{if(!closed)finish(Object.assign(Error('TrueNAS closed the connection'),{truenasFailure:'closed'}))});
  ws.on('message',raw=>{
   if(closed)return;let message;try{message=JSON.parse(raw.toString())}catch{return finish(Object.assign(Error('Invalid TrueNAS response'),{truenasFailure:'response'}))}
   if(!message||typeof message!=='object'||Array.isArray(message))return finish(Object.assign(Error('Invalid TrueNAS response'),{truenasFailure:'response'}));
   if(legacy&&message.msg==='ping'){ws.send(JSON.stringify({msg:'pong',id:message.id}));return}
   if(legacy&&message.msg==='connected'){if(!authenticated)auth();return}
   if(legacy&&message.msg==='failed')return finish(Object.assign(Error('TrueNAS legacy protocol rejected'),{truenasFailure:'protocol'}));
   const id=Number(message.id);
   if(!authenticated){
    if(id!==1)return;
    if(message.error||message.result!==true)return finish(Object.assign(Error('TrueNAS authentication rejected'),{code:message.error?.code,truenasFailure:'authentication'}));
    authenticated=true;next();return;
   }
   if(id!==index+2)return;
   const [method,params=[]]=calls[index];
   if(message.error){
    const error=Object.assign(Error(message.error.data?.reason||message.error.reason||message.error.message||'TrueNAS API error'),{code:message.error.code,providerErrno:message.error.data?.error??message.error.data?.errno??message.error.error,truenasFailure:'request'});
    if(!retried&&!legacy&&method.startsWith('pool.snapshot.')&&(error.code===-32601||/method.*not found|method.*does not exist/i.test(error.message))){retried=true;send(index+2,method.replace('pool.snapshot.','zfs.snapshot.'),params);return}
    results.push({error});
   }else results.push({value:message.result});
   index++;next();
  });
 });
}
