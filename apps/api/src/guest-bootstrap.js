import {Client} from 'ssh2';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pve} from './connectors.js';
import {assertGuestPlacement} from './ssh-target.js';
const active=new Set();
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const preflight=`set -eu
printf 'HC_UID=%s\\n' "$(id -u)"
. /etc/os-release
printf 'HC_OS=%s\\n' "$ID"
printf 'HC_UUID=%s\\n' "$(cat /sys/class/dmi/id/product_uuid 2>/dev/null || true)"
for file in /sys/class/net/*/address; do printf 'HC_MAC=%s\\n' "$(cat "$file")"; done
`;
const agentInstaller=`set -eu
export DEBIAN_FRONTEND=noninteractive
if ! dpkg-query -W -f='\${db:Status-Status}' qemu-guest-agent 2>/dev/null | grep -qx installed; then
 apt-get update
 apt-get install -y qemu-guest-agent
fi
if [ -e /dev/virtio-ports/org.qemu.guest_agent.0 ]; then
 systemctl start qemu-guest-agent
 systemctl is-active --quiet qemu-guest-agent
 printf 'HC_AGENT=ready\\n'
else
 printf 'HC_AGENT=needs-power-cycle\\n'
fi
`;
const installer=readFileSync(new URL('./agent-assets/guest-docker-setup.sh',import.meta.url),'utf8')+`
if [ -e /dev/virtio-ports/org.qemu.guest_agent.0 ] && systemctl is-active --quiet qemu-guest-agent; then
 printf 'HC_AGENT=ready\\n'
else
 apt-get install -y qemu-guest-agent
 printf 'HC_AGENT=needs-power-cycle\\n'
fi
`;
export function bootstrapIdentity(config,output){
 const os=output.match(/^HC_OS=(.+)$/m)?.[1];if(!['debian','ubuntu'].includes(os))throw failure('Automatic setup supports Debian and Ubuntu VMs only');
 if(!/^HC_UID=0$/m.test(output))throw failure('Guest setup requires root or a working sudo password',403);
 const uuid=String(config.smbios1||'').match(/(?:^|,)uuid=([^,]+)/)?.[1]?.toLowerCase();
 const observedUuid=output.match(/^HC_UUID=(.+)$/m)?.[1]?.toLowerCase();
 const expectedMacs=Object.entries(config).filter(([k])=>/^net\d+$/.test(k)).flatMap(([,v])=>String(v).match(/(?:[a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}/g)||[]).map(v=>v.toLowerCase());
 const observedMacs=[...output.matchAll(/^HC_MAC=(.+)$/gm)].map(m=>m[1].toLowerCase());
 // Prefer the VM UUID when Proxmox reports it; do not accept a different UUID via MAC fallback.
 if(uuid?uuid!==observedUuid:!expectedMacs.some(v=>observedMacs.includes(v)))throw failure('SSH host identity does not match the selected VM. Verify its address, UUID and network adapter through the Proxmox console.',403);
 return os;
}
export function enableAgentOption(value){return ['enabled=1',...String(value||'').split(',').filter(v=>v&&!/^(?:[01]|enabled=[01])$/.test(v))].join(',');}
function execute(client,username,password,script,timeout=900000){return new Promise((resolve,reject)=>{
 let output='',settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(output);};
 const timer=setTimeout(()=>{client.end();finish(failure('Guest setup timed out. Changes may have started; inspect the VM before retrying.',504));},timeout);
 // A passwordless sudo must never cause a supplied password to be parsed as shell code.
 // Only the fixed script is a shell argument; credentials travel through stdin.
 const command=username==='root'?'/bin/sh':"sudo -S -p '' /bin/sh -c '"+script.replace(/'/g,"'\"'\"'")+"'";
 client.exec(command,(error,stream)=>{
  if(error)return finish(failure('Guest setup command could not start',422));
  stream.stderr?.on('data',()=>{}); // Drain stderr without retaining potentially sensitive remote output.
  stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-65536)});
  stream.on('error',()=>finish(failure('Guest setup connection was interrupted',422)));
  stream.on('close',code=>finish(code===0?null:failure('Guest setup command failed. Check sudo permissions, package repositories and the VM console. Some changes may already have been applied.',422)));
  stream.end(username==='root'?script:password+'\n');
 });
});}
export async function bootstrapGuest(input,{query=pve,clientFactory=()=>new Client(),run=execute}={}){
 const {node,vmid,host,username,password,fingerprint}=input;
 const purpose=input.purpose||'docker';if(!['docker','guest-agent'].includes(purpose))throw failure('Invalid guest setup purpose');
 if(typeof host!=='string'||!host||host.length>253||/[\s/]/.test(host))throw failure('Enter the VM SSH hostname or IP');
 const port=Number(input.port||22);if(!Number.isInteger(port)||port<1||port>65535)throw failure('Invalid SSH port');
 if(typeof username!=='string'||!username||username.length>100||typeof password!=='string'||!password||password.length>2048||/[\r\n]/.test(password))throw failure('Enter fresh SSH and sudo credentials. Passwords must not contain line breaks.');
 if(typeof fingerprint!=='string'||!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint))throw failure('Verify the SSH host fingerprint before installing');
 await assertGuestPlacement(node,vmid,'qemu',query);
 const base=`/nodes/${encodeURIComponent(node)}/qemu/${encodeURIComponent(vmid)}`;
 const status=await query(base+'/status/current');if(status.status!=='running')throw failure('Start this VM before installing through SSH',409);
 const config=await query(base+'/config');
 if(typeof config.digest!=='string'||!config.digest)throw failure('VM configuration digest is unavailable. Retry the Proxmox reading before installing.',409);
 if(/(?:^|,)type=isa(?:,|$)/.test(String(config.agent||'')))throw failure('Automatic repair supports the VirtIO guest-agent channel. Review this VM’s ISA channel in Proxmox before continuing.');
 const identity=`${node}:${vmid}`;if(active.has(identity))throw failure('Setup is already running for this VM',409);
 const client=clientFactory();active.add(identity);
 try{
  await new Promise((resolve,reject)=>{client.once('ready',resolve);client.once('error',()=>reject(failure('SSH authentication, connection or host fingerprint verification failed',422)));client.connect({host,port,username,password,readyTimeout:12000,keepaliveInterval:10000,hostVerifier:key=>'SHA256:'+crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/,'')===fingerprint});});
  bootstrapIdentity(config,await run(client,username,password,preflight,30000));
  // Revalidate placement immediately before enabling configuration, with optimistic concurrency.
  await assertGuestPlacement(node,vmid,'qemu',query);
  await query(base+'/config',{method:'PUT',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({agent:enableAgentOption(config.agent),...(config.digest?{digest:config.digest}:{})})});
  const output=await run(client,username,password,purpose==='guest-agent'?agentInstaller:installer);
  const requiresPowerCycle=!/^HC_AGENT=ready$/m.test(output);
  let agentVerified=false;
  if(!requiresPowerCycle)try{await query(base+'/agent/get-osinfo');agentVerified=true;}catch{}
  if(purpose==='guest-agent')return {node,vmid:String(vmid),agentVerified,requiresPowerCycle,message:requiresPowerCycle?'Guest-agent package installed and Proxmox option enabled. A full VM shutdown and start is required before verification. No power action was performed.':agentVerified?'QEMU Guest Agent installed, enabled and verified successfully.':'Guest-agent service started, but Proxmox verification failed. Check API permissions and recheck this VM.'};
  return {node,vmid:String(vmid),dockerVerified:true,agentVerified,requiresPowerCycle,message:requiresPowerCycle?'Docker and guest-agent packages installed. A full VM shutdown and start is required to activate the guest-agent channel; no power action was performed.':agentVerified?'Docker and guest agent installed and verified. Waiting for paired-node discovery.':'Docker installed. Guest-agent service is running, but Proxmox verification failed. Check token permissions and retry discovery.'};
 }finally{active.delete(identity);client.end();}
}
