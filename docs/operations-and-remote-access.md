# Operational monitoring, recovery tests and remote access

These features are available for controlled evaluation. They do not change the commercial acceptance gates or publish a new release.

## Hardware and power

Open **Monitoring → Hardware & Diagnostics**. Update paired node connectors to version 7 through **Settings → Connections → Update Connector**. The connector collects Linux thermal/hwmon readings, SMART health and temperature, and local Network UPS Tools readings in a background cycle, waiting one minute between collections. Collection time depends on the number of devices. Freshness is shown separately from measurement availability. Offline, old, waiting and stale connectors do not establish hardware health.

**Install Monitoring Tools** installs `smartmontools` and `nut-client` on Debian/Ubuntu hosts after owner confirmation. It does not configure UPS drivers, an NUT server, battery shutdown policy, disk passthrough or unsupported USB bridges. Configure your actual UPS and vendor shutdown policy separately; no shutdown commands are issued by this feature. Sensors and disks that cannot be read show unavailable values. SMART collection requests standby preservation, never starts a disk self-test, and is bounded to 16 devices. Tools/device firmware may not report every measurement.

Fresh failed SMART health, temperature at or above 80 °C and UPS on-battery/low-battery observations generate normal alerts and use existing notification channels. The temperature threshold is a general warning, not a manufacturer-specific failure limit. Missing readings do not resolve previous hardware alerts; explicit healthy measurements are required.

## Network and response-time diagnostics

**Run Network Diagnostics** checks fixed HTTPS Docker registry endpoints from the selected paired host. It reports HTTP reachability, DNS lookup, connection and TLS cumulative timings. HTTP 401/405 can establish reachability without proving an authenticated image pull. This does not test every guest, a container's DNS namespace, registry credentials or a complete update. No arbitrary URL scan or DNS/network rewrite is performed.

The same page shows controller GET response median, p95, maximum and failure counts from a bounded in-memory sample over the last hour. Data resets on restart and caps at 2,000 responses. Routes are templates; tokens, query parameters and request bodies are not recorded. These are controller HTTP times, including provider waits; browser rendering, device transit and full fleet load/soak results remain separate.

## Guided recovery tests

Open **Backups → Recovery Tests** as an administrator. Select a VM archive, unused VM ID, destination node and active compatible storage. Read and approve the action confirmation. Restore always requests a stopped VM with unique identity; existing guests are never overwritten. Leave sufficient disk space and RAM.

After the provider task succeeds, **Check Restore & Isolate** removes network adapters, passthrough devices, physical disk paths, custom arguments and host hooks, disables automatic boot, and marks the test guest. The guest must remain stopped until isolation is verified. **Boot Isolated Test VM** is a separate confirmed action and rechecks that marker and configuration. Do not concurrently reconfigure or replace the test VM outside i-Clusters; provider administration can bypass this workflow.

Use the Proxmox console to inspect important files, database recovery and application services. A running VM alone is not data verification. **View Verification** requires explicit file/service checks and evidence notes before recording a user-confirmed success. Keep credentials and private contents out of notes. The workflow retains the test VM and record; stop and remove the test VM explicitly through Proxmox after review. It does not automate deletion or reconnect the recovered guest to production networking. LXC, application-specific dumps, off-site copies and disaster recovery of the controller remain separate procedures.

## WireGuard remote access

Open **Settings → Connections → Remote Access** as an owner. Select a paired host with a version 7 connector. Choose a nonoverlapping private IPv4 /24 gateway address and UDP port. **Set Up VPN Gateway** installs WireGuard tools, creates `/etc/wireguard/icvpn.conf` with mode 0600, and enables only `wg-quick@icvpn`. Existing managed configuration is never overwritten. Setup checks local interface subnet overlap but cannot infer every remote network or route; review your topology first. A failed startup leaves the created configuration for deliberate inspection rather than retrying destructively. Package installation needs working Debian/Ubuntu repositories.

Set a reachable hostname/IP and UDP port; forwarding through your router may be required. This first implementation accesses the gateway host itself. It does not automatically enable IP forwarding, NAT, broad LAN routes, firewall exceptions or public dashboard exposure. Place the gateway where it can provide the required host access. Wider server routing needs a separately reviewed firewall/route design. CGNAT traversal and relay hosting are not implemented.

**Create & Approve Device Profile** generates an X25519 key pair inside a supported secure browser. Only the public key and individual /32 tunnel address are submitted. Download the private client profile once and import it into the official WireGuard application on that device. The private key is retained only in component memory until leaving or clearing the page; it is not sent to i-Clusters or placed in browser storage. Protect the downloaded file. Each device needs its own profile. This profile includes only the gateway /32 in AllowedIPs; it is not a full internet tunnel.

Approval and **Revoke Access** require owner confirmation and update both the running interface and persistent managed configuration. Refresh measurements within one minute to verify the reported peer list. Handshake time is an observation, not proof of application permissions or continuous reachability. If a connection or persistence failure occurs, inspect the gateway before retrying; a failed HTTP response does not prove no host change happened. Existing VPNs on other interface names are not managed. Device names, invitations, expiration policies, native branded clients and platform store distribution are not implemented in this evaluation increment. Use existing WireGuard clients. i-Clusters account roles and MFA remain independent of network access.

## References

- [WireGuard quick start](https://www.wireguard.com/quickstart/)
- [WireGuard tools manual](https://github.com/WireGuard/wireguard-tools/blob/master/src/man/wg.8)
- [Network UPS Tools upsc](https://networkupstools.org/docs/man/upsc.html)
- [smartmontools smartctl manual source](https://github.com/smartmontools/smartmontools/blob/main/src/smartctl.8.in)

Live hardware/UPS compatibility, VPN handshake/revocation and application recovery require acceptance on real test devices before production or commercial claims.
