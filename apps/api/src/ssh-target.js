import {isIP} from 'node:net';
import {agentNetworkReports} from './node-agents.js';
export async function assertGuestPlacement(node,id,kind,query){
 if(typeof node!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(node)||!/^\d+$/.test(String(id))||!['qemu','lxc'].includes(kind))throw Object.assign(new Error('Invalid guest target'),{status:400});
 const rows=await query('/cluster/resources');
 if(!Array.isArray(rows)||!rows.some(r=>r.node===node&&String(r.vmid)===String(id)&&r.type===kind))throw Object.assign(new Error('Guest does not belong to the selected Proxmox node'),{status:403});
}
export async function targetSSHHost(target,query,reports=agentNetworkReports){
 if(String(target||'').startsWith('docker:')){
  const id=String(target).slice(7),report=reports().find(r=>r.id===id&&r.kind==='docker');
  if(!report)throw Object.assign(new Error('Selected Docker connector is unavailable'),{status:404});
  if(!report.online)throw Object.assign(new Error('Selected Docker host is offline'),{status:503});
  if(report.network?.status!=='ok'||Date.now()-report.network.receivedAt>90000)throw Object.assign(new Error('Waiting for a current Docker host network report. Update the connector and retry.'),{status:422});
  const candidates=report.network.interfaces.filter(r=>! /^(?:lo$|docker|veth|br-|cni|flannel|virbr)/.test(r.name)).flatMap(r=>r.addresses.map(a=>a.split('/')[0]));
  const host=candidates.find(a=>isIP(a)===4&&! /^(?:127\.|169\.254\.|0\.)/.test(a))||candidates.find(a=>isIP(a)===6&&a!=='::1'&&! /^(?:fe[89ab]|ff)/i.test(a));
  if(host)return host;
  throw Object.assign(new Error('The Docker connector has not reported a usable host SSH address.'),{status:422});
 }
 const [kind,node,id]=String(target||'').split(':');if(!['node','vm','lxc'].includes(kind)||!node)throw Object.assign(new Error('Invalid SSH target'),{status:400});
 if(kind==='node'){const rows=await query('/cluster/status');const host=rows.find(r=>r.type==='node'&&r.name===node)?.ip;if(host)return host;}
 else{const resources=await query('/cluster/resources');if(!resources.some(r=>r.node===node&&String(r.vmid)===id&&r.type===(kind==='vm'?'qemu':'lxc')))throw Object.assign(new Error('Target does not belong to this cluster node'),{status:403});const base=`/nodes/${encodeURIComponent(node)}/${kind==='vm'?'qemu':'lxc'}/${encodeURIComponent(id)}`;const result=await query(kind==='vm'?base+'/agent/network-get-interfaces':base+'/interfaces');const rows=result?.result||result;const candidates=(Array.isArray(rows)?rows:[]).flatMap(r=>[r.inet?.split('/')[0],...(r['ip-addresses']||[]).map(a=>a['ip-address'])]);const host=candidates.find(a=>a&&!a.includes(':')&&!a.startsWith('127.')&&a!=='0.0.0.0');if(host)return host;}
 throw Object.assign(new Error('Target SSH address is not reported by Proxmox. Enable guest-agent networking before approving this action.'),{status:422});
}
