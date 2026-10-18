// Return fixed diagnostics only. Provider messages can contain credentials or URLs.
export function truenasTestError(error){
 const code=error?.code??error?.cause?.code,status=error?.providerStatus;
 if(code==='ERR_TLS_CERT_ALTNAME_INVALID')return 'Certificate hostname mismatch. Use an HTTPS hostname listed in the TrueNAS certificate, or replace the certificate with one that includes this IP address in its Subject Alternative Names. Pasting a trusted CA does not fix a hostname mismatch.';
 if(code==='CERT_HAS_EXPIRED')return 'The TrueNAS TLS certificate has expired. Renew the certificate selected for the TrueNAS web interface and check both servers’ clocks.';
 if(code==='CERT_NOT_YET_VALID')return 'The TrueNAS TLS certificate is not valid yet. Check both servers’ clocks and the certificate validity dates.';
 if(['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_UNTRUSTED'].includes(code))return 'The TrueNAS TLS certificate is not trusted. Paste the PEM CA certificate that issued the certificate used by the TrueNAS web interface, including any required intermediate certificates. For a self-signed certificate, paste that exact certificate.';
 if(code==='ENOTFOUND'||code==='EAI_AGAIN')return 'The HomeCloud server could not resolve the TrueNAS hostname. Check the endpoint and DNS on the HomeCloud server.';
 if(code==='ECONNREFUSED')return 'TrueNAS refused the HTTPS connection. Check the endpoint port and that the TrueNAS web interface is listening on it.';
 if(['ENETUNREACH','EHOSTUNREACH'].includes(code))return 'The HomeCloud server cannot reach TrueNAS. Check VM networking, routing, VLANs and firewall rules between the servers.';
 if(['ETIMEDOUT','ESOCKETTIMEDOUT'].includes(code))return 'TrueNAS did not respond before the connection timeout. Check the address, HTTPS port, firewall and TrueNAS API service from the HomeCloud server.';
 if(code===-32601||error?.truenasFailure==='protocol'||[404,405,426].includes(status))return 'The selected TrueNAS API protocol or WebSocket endpoint is unavailable. Use current for TrueNAS 25.04 and later, and legacy for older releases. Check that any reverse proxy permits WebSocket connections.';
 if(code===-32000||status===429)return 'TrueNAS is limiting concurrent API requests. Wait for other requests to finish, then test the connection again.';
 if(error?.truenasFailure==='authentication'||status===401)return 'TrueNAS rejected API authentication. Check that the complete API key is correct, unexpired and not revoked, and that its user account is enabled. Use a TrueNAS API key, not the VM or node password.';
 if(error?.providerErrno===1||error?.providerErrno===13||status===403)return 'TrueNAS denied access. Check the API key user’s roles and any proxy access rules. The read-only connection test requires permission to call system.info.';
 if(code==='ECONNRESET'||error?.truenasFailure==='closed')return 'TrueNAS closed the connection before the check completed. Check the TrueNAS API service and any reverse proxy WebSocket settings.';
 if(typeof code==='string'&&/CERT|TLS|SSL/.test(code))return 'The TLS handshake with TrueNAS failed. Check the certificate chain, hostname, validity dates and HTTPS configuration. Certificate verification remains enabled.';
 if(error?.truenasFailure==='response')return 'The endpoint returned an invalid TrueNAS API response. Check that this is the TrueNAS HTTPS address and that the selected API protocol matches its version.';
 return 'TrueNAS connection check failed. Check the endpoint, API key permissions, network and trusted CA certificate. The server did not return a recognised failure reason.';
}
