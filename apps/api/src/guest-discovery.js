const linuxScript = `printf '__SERVICES__\n'; systemctl list-units --type=service --all --no-legend --plain --no-pager 2>/dev/null; printf '__PACKAGES__\n'; dpkg-query -W -f='\${binary:Package}\t\${Version}\t\${db:Status-Status}\n' 2>/dev/null; printf '__DOCKER__\n'; docker ps -a --no-trunc --format '{{json .}}' 2>/dev/null; printf '__END__\n'`;
const windowsScript = `$s=@(Get-Service|ForEach-Object{@{name=$_.Name;status=$_.Status.ToString().ToLower()}});$p=@(Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue|Where-Object DisplayName|ForEach-Object{@{name=$_.DisplayName;version=$_.DisplayVersion;status='installed'}});@{services=$s;packages=$p;containers=@()}|ConvertTo-Json -Depth 4 -Compress`;
export function parseLinuxInventory(output){
 const result={services:[],packages:[],containers:[]};let section='';
 for(const line of String(output).split(/\r?\n/)){
  if(line.startsWith('__')){section=line;continue;}
  if(section==='__SERVICES__'){const fields=line.trim().split(/\s+/);if(fields.length>=4)result.services.push({name:fields[0],status:fields[2]==='active'?fields[3]:fields[2]});}
  if(section==='__PACKAGES__'){const [name,version,status]=line.split('\t');if(status==='installed')result.packages.push({name,version,status});}
  if(section==='__DOCKER__')try{const c=JSON.parse(line);if(c.ID&&c.Names)result.containers.push({id:c.ID,name:c.Names,image:c.Image,status:c.State});}catch{}
 }
 return result;
}
const cache=new Map();
export async function inspectGuests(guests,call,connection){
 const reports=[],limitations=[];
 for(let i=0;i<guests.length;i+=3)await Promise.all(guests.slice(i,i+3).map(async guest=>{
  if(guest.status!=='running')return;
  const key=`${connection}:${guest.node}:${guest.id}`;
  let entry=cache.get(key);
  if(!entry||Date.now()-entry.time>300000){
   try{
    const base=`/nodes/${encodeURIComponent(guest.node)}/qemu/${encodeURIComponent(guest.id)}/agent`;
    const info=await call(`${base}/get-osinfo`,{timeoutMs:4000}),os=info?.result||info;
    if(!os||typeof os!=='object'||Array.isArray(os))throw new Error('Guest OS information unavailable');
    const windows=/windows/i.test(`${os.name||''} ${os.id||''}`);
    const command=windows?['powershell.exe','-NoProfile','-NonInteractive','-Command',windowsScript]:['/bin/sh','-c',linuxScript];
    const execution=await call(`${base}/exec`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})});
    if(!Number.isInteger(execution?.pid))throw new Error('Guest inventory could not start');
    let result;
    for(let attempt=0;attempt<10;attempt++){
     result=await call(`${base}/exec-status?pid=${execution.pid}`);
     if(result?.exited)break;
     await new Promise(resolve=>setTimeout(resolve,500));
    }
    if(!result?.exited||result.exitcode!==0||result['out-truncated'])throw new Error('Guest inventory incomplete or still running');
    const inventory=windows?JSON.parse(result['out-data']||'{}'):parseLinuxInventory(result['out-data']);
    entry={time:Date.now(),report:{id:`qga-${guest.id}`,hostname:guest.name,node:guest.node,os:os.name||os.id,receivedAt:new Date().toISOString(),status:'online',services:(inventory.services||[]).slice(0,1000),packages:(inventory.packages||[]).slice(0,6000),containers:(inventory.containers||[]).slice(0,1000),errors:[],source:'Proxmox guest API'}};
   }catch(error){entry={time:Date.now(),error:`${guest.name}: ${error.message}. Existing QEMU guest agent and guest-agent API permissions are required for in-guest inventory.`};}
   cache.set(key,entry);if(cache.size>1000)cache.delete(cache.keys().next().value);
  }
  if(entry.report)reports.push(entry.report);else limitations.push(entry.error);
 }));
 return {reports,limitations};
}
