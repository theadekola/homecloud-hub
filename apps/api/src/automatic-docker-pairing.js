import {createAutomaticNodePairing} from './automatic-node-pairing.js';
import {pve} from './connectors.js';
import {targetSSHHost,assertGuestPlacement} from './ssh-target.js';
export function createAutomaticDockerPairing(options={}){
 const query=options.query||pve;
 return createAutomaticNodePairing({...options,kind:'docker',readyHost:n=>n.hosts?.some(h=>h.id==='node'&&h.online&&!h.setup),resolveTarget:async(target,c)=>{
 const match=target.match(/^([A-Za-z0-9_.-]+):(qemu|lxc)\/(\d+)$/);if(!match)throw Object.assign(Error('Select a discovered VM or CT.'),{status:400});const [,node,kind,id]=match,q=path=>query(path,{},c);
 await assertGuestPlacement(node,id,kind,q);const cfg=await q(`/nodes/${encodeURIComponent(node)}/${kind}/${id}/config`),uuid=kind==='qemu'?String(cfg.smbios1||'').match(/(?:^|,)uuid=([^,]+)/)?.[1]:undefined,macs=Object.entries(cfg).filter(([k])=>/^net\d+$/.test(k)).flatMap(([,v])=>String(v).match(/(?:[a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}/g)||[]).map(v=>v.toLowerCase());if(!uuid&&!macs.length)throw Object.assign(Error('The selected guest has no verifiable UUID or network adapter identity.'),{status:409});
 return {host:await targetSSHHost(`${kind==='qemu'?'vm':'lxc'}:${node}:${id}`,q),sshTarget:`${kind==='qemu'?'vm':'lxc'}:${node}:${id}`,identity:{uuid,macs}};
 }});
}
export const automaticDockerPairing=createAutomaticDockerPairing();
