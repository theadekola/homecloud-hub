const certificateCommand=`umask 077
cd "$(mktemp -d /root/homecloud-cert.XXXXXX)" || exit

openssl req -x509 -newkey rsa:3072 -sha256 -nodes \\
  -days 365 \\
  -keyout truenas.key \\
  -out truenas.crt \\
  -subj "/CN=XXXXX" \\
  -addext "subjectAltName=IP:XXXXX" \\
  -addext "basicConstraints=critical,CA:FALSE" \\
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \\
  -addext "extendedKeyUsage=serverAuth"`;

export default function TrueNASCertificateGuide(){
 return <details className="truenas-certificate-guide">
  <summary>Set up HTTPS for TrueNAS: certificate instructions</summary>
  <p>Use these steps if you need a self-signed certificate for a TrueNAS IPv4 address. If your existing trusted certificate already matches your endpoint, keep using it.</p>
  <p className="truenas-ip-instruction"><strong>Replace <code>XXXXX</code> in <code>CN=XXXXX</code>, <code>IP:XXXXX</code> and <code>https://XXXXX</code> with your actual TrueNAS IP address.</strong> Keep the <code>IP:</code> prefix in the SAN. Leave the six X characters in <code>homecloud-cert.XXXXXX</code> unchanged; they create a unique temporary folder name.</p>
  <ol>
   <li><h4>Open the TrueNAS shell</h4><p>In TrueNAS, open <strong>System → Shell</strong>, then become root. Run these commands on the TrueNAS system.</p><pre><code>sudo -i</code></pre></li>
   <li><h4>Create the certificate</h4><p>Replace both IP placeholders before running this block. It creates a certificate valid for one year with your address in its Subject Alternative Names (SAN).</p><pre><code>{certificateCommand}</code></pre><p><a href="https://docs.openssl.org/3.0/man1/openssl-req/" target="_blank" rel="noopener noreferrer">OpenSSL certificate documentation</a></p></li>
   <li><h4>Import the certificate into TrueNAS</h4><p>Display the certificate and private key:</p><pre><code>{'cat truenas.crt\ncat truenas.key'}</code></pre><p>Keep this shell open. In another browser tab, open <strong>TrueNAS → Credentials → Certificates → Import</strong>.</p>
    <div className="truenas-guide-table"><table><thead><tr><th>Field</th><th>Enter</th></tr></thead><tbody>
     <tr><td>Name</td><td><code>homecloud_truenas</code></td></tr>
     <tr><td>Certificate</td><td>The entire <code>BEGIN CERTIFICATE</code> block, including both boundary lines.</td></tr>
     <tr><td>Private Key</td><td>The entire <code>BEGIN PRIVATE KEY</code> block, including both boundary lines.</td></tr>
     <tr><td>Password / Confirm Password</td><td>Leave blank because this key is unencrypted.</td></tr>
    </tbody></table></div><p>Click <strong>Import</strong>. The private key belongs in TrueNAS only. Never paste it into i-Clusters or share it.</p>
   </li>
   <li><h4>Select the new GUI certificate</h4><p>Open <strong>TrueNAS → System → General Settings → GUI → Settings</strong>. Select <code>homecloud_truenas</code> under <strong>GUI SSL Certificate</strong>, keep HTTPS port <code>443</code>, then click <strong>Save</strong> and accept the prompt to apply the change. Open <code>https://XXXXX</code> using your actual TrueNAS IP address.</p><p><a href="https://www.truenas.com/docs/scale/25.10/scaletutorials/credentials/certificates/certificatesscale/" target="_blank" rel="noopener noreferrer">TrueNAS certificate import and GUI setup documentation</a></p></li>
   <li><h4>Connect from i-Clusters</h4><div className="truenas-guide-table"><table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>
    <tr><td>HTTPS endpoint</td><td><code>https://XXXXX</code>, replacing <code>XXXXX</code> with your actual TrueNAS IP address.</td></tr>
    <tr><td>API key</td><td>Your TrueNAS API key.</td></tr>
    <tr><td>API protocol</td><td><code>current</code> for TrueNAS 25.04 and later.</td></tr>
    <tr><td>Trusted CA certificate (PEM)</td><td>The complete contents of <code>truenas.crt</code> for the self-signed certificate created above.</td></tr>
   </tbody></table></div><p>Click <strong>Test Connection</strong>, then <strong>Save Configuration</strong> once successful. Keep the old <code>truenas_default</code> certificate until the new connection works. Renew the new certificate before its one-year expiry.</p></li>
  </ol>
 </details>;
}
