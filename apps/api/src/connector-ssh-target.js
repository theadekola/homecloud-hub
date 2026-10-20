import {isIP} from 'node:net';
import {pve} from './connectors.js';
export async function connectorSSHAddress(node,{query=pve}={}){
 const hostname=node.hostname||node.name,base={host:hostname,port:22,source:'hostname',message:'Enter an IP address reachable from the i-Clusters server if this hostname does not resolve.'};
 if(node.kind==='docker')return base;
 try{
  const rows=await query('/cluster/status');if(!Array.isArray(rows))return base;
  const candidates=rows.filter(r=>r.type==='node'&&typeof r.name==='string'),name=String(hostname||'').toLowerCase(),exact=candidates.filter(r=>r.name.toLowerCase()===name),matches=exact.length?exact:candidates.filter(r=>r.name.toLowerCase().split('.')[0]===name.split('.')[0]);
  if(matches.length===1&&isIP(String(matches[0].ip||'')))return {host:matches[0].ip,port:22,source:'proxmox',message:'SSH address reported for this paired node by the configured Proxmox cluster. Verify its SSH fingerprint before updating.'};
 }catch{}
 return base;
}
