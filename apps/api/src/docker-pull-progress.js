import {StringDecoder} from 'node:string_decoder';
// Docker's byte totals arrive per layer. Keep the overall estimate below the
// verification milestone and never consider progress records proof of success.
export function dockerPullProgress(report=()=>{}){
 const layers=new Map(),decoder=new StringDecoder('utf8');let pending='',failure=null;
 const event=e=>{
  if(e?.error||e?.errorDetail)failure=Error('Docker registry rejected the image pull. Check registry access, credentials and available disk space.');
  if(typeof e?.id!=='string'||e.id.length>128||!['Pulling fs layer','Waiting','Downloading','Download complete','Extracting','Pull complete','Already exists'].includes(e.status))return;
  const old=layers.get(e.id)||{},d=e.progressDetail||{};
  const number=n=>Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER?n:0;
  const layer={...old,status:e.status};
  if(e.status==='Downloading'){layer.current=number(d.current);layer.total=number(d.total)}
  if(e.status==='Download complete'||e.status==='Pull complete')layer.current=layer.total||layer.current||0;
  if(e.status==='Extracting')layer.extract=number(d.total)?Math.min(1,number(d.current)/number(d.total)):0;
  if(!layers.has(e.id)&&layers.size>=256)return;
  layers.set(e.id,layer);
  let weight=0,bytes=0,ready=0;
  for(const l of layers.values()){
   bytes+=l.current||0;
   if(['Pull complete','Already exists'].includes(l.status)){weight++;ready++}
   else if(l.status==='Extracting')weight+=.8+.2*(l.extract||0);
   else if(l.status==='Download complete')weight+=.8;
   else if(l.total)weight+=.8*Math.min(1,(l.current||0)/l.total);
  }
  report(20+Math.floor(40*weight/layers.size),`Pulling image · ${(bytes/1048576).toFixed(1)} MiB downloaded · ${ready}/${layers.size} layers ready`);
 };
 return {event,chunk(chunk){pending+=decoder.write(chunk);if(pending.length>262144)throw Error('Invalid Docker pull progress stream');let split;while((split=pending.indexOf('\n'))>=0){const line=pending.slice(0,split);pending=pending.slice(split+1);if(line.trim())event(JSON.parse(line))}},finish(){pending+=decoder.end();if(pending.trim())event(JSON.parse(pending));if(failure)throw failure;return []}};
}
