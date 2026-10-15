// Match the failing connector and operation, rather than prescribing Proxmox ACLs for every warning.
export function serviceGuidance(service:{provider?:string;status?:string;error?:string}){
 const error=service.error||'';
 if(service.provider==='docker'){
  if(/offline/i.test(error))return 'The paired host or node is offline. Check homecloud-node-agent.service on its paired Linux host, its network connection and the selected guest’s power state. Recheck after it resumes reporting.';
  if(/statistics unavailable/i.test(error))return 'Docker inventory is connected, but some container measurements are unavailable. Check the affected containers on that Docker host, update its paired connector to version 4, and recheck. Missing measurements remain unknown.';
  if(/timed out|timeout|time budget/i.test(error))return 'The Docker host did not answer within the measurement deadline. Check its paired connector and Docker service, update the connector to version 4, then recheck the selected host under Docker.';
  if(/HTTP (401|403)/i.test(error))return 'The Docker Engine rejected access. Check the selected Docker connection’s credentials or socket permissions. Proxmox read permissions do not grant Docker Engine access.';
  if(/guest agent|guest-agent|qemu/i.test(error))return 'Check the selected VM’s QEMU guest agent, or use verified SSH setup under Docker. Enabling the Proxmox option alone does not install the guest service.';
  return 'Open Docker and select this host. Check the paired connector status and Docker service; use Install & Connect only if setup is required. Update older paired connectors to version 4, then recheck.';
 }
 if(service.provider==='proxmox'&&/HTTP 403|permission check failed/i.test(error))return 'For cluster read access, assign PVEAuditor at / with Propagate to the connected Proxmox user and its privilege-separated API token. Guest-agent commands and management actions require additional, separately scoped privileges.';
 if(service.status==='pending')return 'Measurements are still loading. Wait for the current scan to finish.';
 return 'Check this provider’s connection settings, endpoint reachability and reported error, then recheck in Monitoring.';
}
