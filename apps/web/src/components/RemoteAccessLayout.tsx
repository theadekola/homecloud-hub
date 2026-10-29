import {useState,type ReactNode} from 'react';
import {Camera,Copy,ExternalLink,Globe,Monitor,Server,ShieldCheck,Smartphone,Wifi} from 'lucide-react';
import {dashboardLink,gatewayState} from '../mobile-access';
import AccessQR from './AccessQR';
import './remote-access.css';
export default function RemoteAccessLayout({node,children}:{node:any;children:ReactNode}){
 const [address,setAddress]=useState(window.location.origin),[copy,setCopy]=useState('');
 const url=dashboardLink(address),state=gatewayState(node),peers=node?.report?.vpn?.peers||[];
 const recent=peers.filter((p:any)=>p.lastHandshake&&Date.now()/1000-p.lastHandshake>=0&&Date.now()/1000-p.lastHandshake<180).length;
 const copyLink=async()=>{try{await navigator.clipboard.writeText(url);setCopy('Dashboard link copied.')}catch{setCopy('Copy unavailable. Select the dashboard address to copy it.')}};
 return <div className="remote-access-grid">
  <section className="card mobile-access-card" aria-labelledby="mobile-access-title">
   <div className="access-brand"><img src="/assets/iclusters-192.png" alt=""/><strong>i-Clusters</strong><a href={url||undefined} className="btn secondary small" aria-disabled={!url}>Open in Browser <ExternalLink size={16}/></a></div>
   <h2 id="mobile-access-title">Access Your Dashboard<br/>on Mobile</h2><p>Scan with your phone’s camera to open i-Clusters in your mobile browser.</p>
   <div className="dashboard-qr-frame">{url?<AccessQR value={url} label="Scan to open the i-Clusters dashboard on mobile"/>:<p>Enter an HTTPS dashboard address to generate your QR code.</p>}</div>
   <label>Dashboard address<input aria-label="Mobile dashboard address" type="url" value={address} onChange={e=>{setAddress(e.target.value);setCopy('')}}/></label>
   {!url&&<p role="alert">Use the HTTPS dashboard origin only, without a path, credentials or query parameters.</p>}
   <div className="access-link"><code>{url||'HTTPS address required'}</code><button className="icon-btn" aria-label="Copy dashboard link" disabled={!url} onClick={copyLink}><Copy size={18}/></button></div>{copy&&<p role="status">{copy}</p>}
   <ol className="mobile-scan-steps"><li><Camera/><span>Open your camera</span></li><li><Smartphone/><span>Scan the QR code</span></li><li><Monitor/><span>Sign in and install</span></li></ol>
   {url&&<a className="btn primary access-open" href={url}><ExternalLink size={18}/>Open Dashboard on This Device</a>}
   <div className="access-note"><ShieldCheck/><div><strong>Your usual sign-in still applies</strong><p>Connect to the same network or your VPN first. Use an address reachable from your phone with a trusted HTTPS certificate.</p></div></div>
   <details><summary>Install on Android or iPhone</summary><p>Android: open the scanned link, then tap Install i-Clusters when offered. You can also use your browser’s Install app or Add to Home screen menu.</p><p>iPhone: open in Safari, tap Share, then Add to Home Screen. Keep Open as Web App enabled when shown, then tap Add.</p></details>
  </section>
  <div className="vpn-main-column"><section className="card vpn-overview"><h2>VPN Connection</h2><p>Connect to your home network with WireGuard.</p><div className="vpn-route" aria-label="VPN access path"><Globe size={40}/><span>Internet</span><i/><ShieldCheck size={42}/><span>Encrypted tunnel</span><i/><Server size={40}/><strong>{node?.name||'Choose a paired gateway'}</strong></div><div className="vpn-route-destinations"><span><Monitor/>Dashboard</span><span><Server/>Approved servers</span><span><Wifi/>Permitted LAN services</span></div><p className="muted">Routes become available only after gateway setup, device approval and service grants.</p></section>{children}</div>
  <aside className="vpn-sidebar"><section className="card"><h3>VPN Status</h3><p className={'gateway-badge '+(state.ready?'ready':'pending')}><span/>{state.label}</p><p>{state.ready?'The selected gateway reports its WireGuard interface.':'Set up a gateway using a current paired host.'}</p><dl><dt>Approved devices</dt><dd>{state.ready?peers.length:'Not available'}</dd><dt>Recent handshakes</dt><dd>{state.ready?recent:'Not available'}</dd></dl><p className="muted">Gateway telemetry does not establish this browser’s VPN connection or remote service access.</p></section>
   <section className="card vpn-clients"><h3>Supported Clients</h3>{[['Windows','Official WireGuard client'],['macOS','Official WireGuard client'],['Android','WireGuard app'],['iPhone / iOS','WireGuard app'],['Linux','WireGuard tools']].map(([name,detail])=><a key={name} href="https://www.wireguard.com/install/" target="_blank" rel="noreferrer"><Monitor size={21}/><span><strong>{name}</strong><small>{detail}</small></span><ExternalLink size={15}/></a>)}</section>
   <section className="card"><h3>Setup Instructions</h3><ol className="vpn-setup-steps"><li>Set up the gateway on a paired host.</li><li>Forward its UDP port from your router if required. CGNAT needs another reachable endpoint.</li><li>Create a separate device profile and import it into WireGuard.</li><li>Approve specific LAN services, then update that device’s AllowedIPs.</li><li>Enable the tunnel in WireGuard and test from mobile data.</li></ol><p>WireGuard is the supported protocol. The browser dashboard cannot turn on a device’s VPN.</p></section>
  </aside>
 </div>;
}
