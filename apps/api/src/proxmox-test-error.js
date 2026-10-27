// Only fixed diagnostics: upstream messages may contain connection credentials.
export function proxmoxTestError(error){
 const code=error?.code??error?.cause?.code,status=error?.providerStatus;
 if(status===401)return 'Proxmox rejected the API token. Check the full user@realm!token ID and token secret, and that the user and token are enabled and unexpired.';
 if(status===403||error?.noNodes)return 'Proxmox did not allow node inventory access. Assign PVEAuditor at / with Propagate to the connected user and, with Privilege Separation, to the API token too.';
 if(code==='ERR_TLS_CERT_ALTNAME_INVALID')return 'The Proxmox certificate does not match this host or IP. Use a matching address or change Verify server certificate under Advanced certificate settings.';
 if(['CERT_HAS_EXPIRED','CERT_NOT_YET_VALID'].includes(code))return 'The Proxmox certificate is expired or not yet valid. Check the certificate and both servers’ clocks, or change verification under Advanced certificate settings.';
 if(typeof code==='string'&&/CERT|TLS|SSL|VERIFY_LEAF/.test(code))return 'Proxmox certificate verification failed. Under Advanced certificate settings, use a trusted certificate or turn off Verify server certificate to accept the self-signed certificate.';
 if(['ENOTFOUND','EAI_AGAIN'].includes(code))return 'The i-Clusters server could not resolve the Proxmox hostname. Check the host and server DNS.';
 if(code==='ECONNREFUSED')return 'Proxmox refused the connection. Check the host, API port (normally 8006) and that the Proxmox API service is running.';
 if(['ENETUNREACH','EHOSTUNREACH'].includes(code))return 'The i-Clusters server cannot reach Proxmox. Check routing, VLANs and firewall access to the API port.';
 if(['ETIMEDOUT','ESOCKETTIMEDOUT'].includes(code)||error?.message==='Connector request timed out')return 'Proxmox did not respond before the timeout. Check the host, API port, firewall and Proxmox API service from the i-Clusters server.';
 if(code==='ECONNRESET')return 'Proxmox closed the connection. Check its API service and any reverse proxy or firewall.';
 if([404,405].includes(status)||error?.invalidResponse)return 'The endpoint did not return Proxmox node inventory. Use the Proxmox host and API port, normally 8006, and check any reverse proxy configuration.';
 if(status)return `The Proxmox API returned HTTP ${Number.isInteger(status)?status:'error'}. Check the API service and any reverse proxy, then retry.`;
 return 'The Proxmox connection could not be checked. Verify the host, API port, token access and network connectivity from the i-Clusters server.';
}
