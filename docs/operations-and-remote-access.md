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

## Optional LAN service access (connector 8)

Gateway-only access remains the default. Update the selected connector to version **8**. Install Monitoring Tools also installs `nftables`; existing gateways must do this before applying a LAN policy. New gateway setup includes nftables. No LAN rules are enabled by an update alone.

An owner can add **Permitted LAN services** under Remote Access. Each rule names an approved device, one RFC1918 server **/32**, TCP or UDP, one port, and the gateway's routed LAN/VLAN interface. Whole subnets, public addresses, gateway-local addresses, the tunnel subnet, unknown peers and default-route-only destinations are rejected. Known remote-device LANs are checked for overlap with the tunnel and destinations. Unknown remote networks cannot be inferred and need a device-side check. Conflicting address spaces require renumbering or a separately designed translation arrangement.

Grant each Proxmox node, VM or Docker host/service individually. For example, grant TCP 8006 to one Proxmox node, TCP 443 to one VM service and a separate grant to a second VLAN's host. Published Docker host ports are usually preferable to ephemeral container addresses. Do not grant an entire management network. Discovery in i-Clusters does not itself grant VPN access. Application authentication remains required, and this does not publish the dashboard or change router forwarding.

The LAN interface must have an existing explicit main-table route; the effective route for forwarded VPN traffic must select that interface. i-Clusters does not create VLANs or change LAN routers. With **routed** mode, the destination/router needs a return route for the tunnel subnet via this gateway. With **NAT**, only the approved service tuple is masqueraded; the destination sees the gateway's LAN address. Other host/Proxmox/Docker firewalls can still deny traffic. Existing policy-routing, asymmetric routing and reverse-path filters need operator review.

Explicit owner confirmation replaces the complete policy. A dedicated `inet iclusters_lan` nftables table allows only device/server/service pairs and their established replies, then drops all other forwarded traffic involving `icvpn`, including peer-to-peer and IPv6 forwarding. Other tables and interfaces are not flushed. Accept rules do not bypass later host firewall chains. IPv4 forwarding is enabled only after the isolation guard is applied. A root-only policy file and a `PreUp` helper restore the guard before the managed tunnel starts after reboot. Existing WireGuard keys, peers, addresses and unrelated VPN interfaces are preserved. An existing custom PreUp hook requires manual review. The helper snapshot is refreshed on policy application; apply the retained policy after a connector update that changes routing behaviour.

Client private keys remain on their devices. After adding grants, copy the **Client AllowedIPs** shown for that device into its existing WireGuard profile. Retain the gateway /32 and add the permitted server /32 addresses. WireGuard routes select destinations, while the gateway firewall enforces ports. New profiles initially have gateway-only access because a new key has no LAN grants yet. Do not create a replacement device just to change its routes.

### Controlled verification

Keep a local administrative session available. Record the current policy, tunnel configuration and forwarding value privately before changing them; the tunnel configuration contains a private key. Start with one device and one noncritical service. Verify:

1. `sudo wg show icvpn` reports the expected public peer and a recent handshake from a real device on a different network.
2. `sudo nft list table inet iclusters_lan` shows the exact source /32, destination /32, interface, protocol and port. Check `sysctl net.ipv4.ip_forward` and `ip -4 route get SERVER_IP` on the gateway.
3. The device can authenticate to the permitted service. Another port, another server/VLAN, another peer and another device without the grant must fail. Test both routed and NAT return paths where used.
4. Revoke the device, then verify both new and existing service connections stop, its live peer is absent, and it is absent from the persistent config. Reboot/restart testing belongs on a dedicated gateway during an agreed maintenance window.

A fresh telemetry report, successful configuration response or WireGuard handshake alone is not proof of LAN service reachability. ICMP is not granted by this service-only policy, so ping failure is expected.

### Disable, failure and rollback

**Disable LAN Access** replaces grants with an empty policy while retaining the forward isolation guard and gateway access. It deliberately leaves the global forwarding sysctl unchanged because other VMs, containers or routers might use it. Reapply a previously recorded policy to roll back a service change, with owner confirmation and overlap checks. Do not flush the nftables ruleset or remove the guard while the tunnel is up.

Firewall replacement is a checked nftables transaction. Failed validation leaves the previous live table; failures while persisting changes attempt to restore the prior policy and the previous forwarding value. An interrupted host/controller connection or failed rollback still requires local inspection before retrying. Peer revocation removes LAN grants first and writes peer removal to disk before removing the live peer. A live removal failure is reported and requires local verification; it is not reported as a completed revocation. Gateway-host access has the same pre-existing host firewall permissions as before.

For emergency local isolation, `sudo ip link set icvpn down` stops VPN traffic. Inspect and restore the recorded policy/config locally before bringing the tunnel back up; use a maintenance window because all VPN devices are affected. Do not reset shared forwarding to zero unless you have established that no other network services depend on it.

Automated tests cover validation, authorization boundaries, firewall generation, revoked-peer filtering and failed-change rollback with simulated commands. They do **not** establish Linux kernel firewall acceptance, provider compatibility, physical-device handshakes, real LAN isolation or routed/NAT connectivity. No live gateway/network access was available during this implementation. CGNAT traversal, relays, native clients and automatic endpoint discovery remain unimplemented. A publicly reachable UDP gateway or a separately reviewed relay/tunnel arrangement is still required.

## Temperature visibility and TrueNAS authentication

The Monitoring overview includes per-host maximum temperatures, individual readings and report freshness for administrators/owners. Missing or stale readings are not marked healthy. A reported 126 °C Dell hwmon sensor is retained as reported; verify its label, sensor support and manufacturer limits on the actual host before treating it as either genuine overheating or an unsupported/sentinel reading.

TrueNAS monitoring now uses the same safe, actionable diagnostic messages as connection tests. An authentication rejection requires checking the saved API key, expiry/revocation, enabled user account and appropriate API permissions, then testing the connection and refreshing monitoring. Use the API protocol matching the installed TrueNAS version. Manually resolving an alert does not fix authentication. No credentials were changed and no live TrueNAS authentication was tested here.

### Temperature source and validation

The overview shows the CPU package/core maximum separately from the maximum across all reported sensor types. The latter can be a different component and must not be interpreted as CPU temperature. Coretemp measurements are identified by their driver; this does not establish support for every CPU vendor.

After updating the paired connector, expand **Sensor source & validation** to inspect the sysfs source, raw millidegree value, label, driver fault flag and available maximum/critical thresholds. The API whitelists these fields. Missing metadata means unknown, not healthy. A driver-reported fault excludes that reading from the gauge maximum and creates a sensor-fault warning; it cannot clear a prior high-temperature warning. Only explicit fault-free data can resolve the sensor-fault warning.

A raw `126000` input converts to `126 °C`. Do not discard, clamp or classify it as false solely because of that number. A fixed unlabelled Dell SMM channel while CPU readings vary is evidence to investigate firmware/sensor support, not proof of physical temperature or proof of a harmless sentinel. Compare the named host's raw sysfs readings and `sensors` output, if installed, then validate through BIOS/manufacturer diagnostics during an agreed maintenance window. Reading the same sysfs value with another Linux tool is not independent physical verification. Do not change fan control, unload the driver, update firmware or stress production workloads just to silence an alert. See the [Linux Dell SMM driver documentation](https://docs.kernel.org/hwmon/dell-smm-hwmon.html).

Existing connectors remain compatible and show their previous readings until updated. Update the application first, then paired connectors under **Settings → Connections** to obtain source/fault metadata. A controller-only update cannot add metadata to an older connector report. Retain the prior connector/configuration and use the documented connector update/rollback procedure if verification fails.


### Monitoring-tool installation approval

**Install Monitoring Tools** opens the same host-credential form used for connector maintenance: paired host address, SSH port, fresh username/password, fingerprint verification and an installation consent checkbox. A typed challenge is no longer used for this action. HTTPS is required before credentials can be entered. The API remains owner-only and validates the selected pairing on the SSH host before package changes. Credentials are used for the action and are not saved.

The fixed host-only operation installs `smartmontools`, `nut-client` and `nftables`, then verifies package status before reporting success. It cannot target a guest or run arbitrary commands. Completion and fresh hardware measurements are separate checks. Closing the popup cannot stop an installation already running; after an interruption, inspect package-manager status on that host before retrying. Package installation is not automatically rolled back. Existing paired connector versions remain compatible because this maintenance operation runs through authenticated SSH.

### Container action approval and Docker network addresses

Container **Stop, Restart, Pause, Unpause and Remove** require a server confirmation challenge before execution. Where the selected Proxmox Docker host has an SSH mapping, the approval popup uses the connector-maintenance layout with fresh root/sudo credentials, host fingerprint verification and explicit consent. A grant is bound to the user, host, container action, method and body and is single-use. Saved passwords do not approve these actions. Connections without an SSH mapping use an explicit confirmation popup rather than requesting credentials for an unidentified host. Removal still requires administrator/owner access. Changing Docker host during a reviewed request cancels its retry; clicking Cancel does not run the container action.

Docker Networks initially shows the full-width table. **View** opens the selected network's details beside it, and **Close** at the top hides those details. Filtering out or removing the selected network closes its panel instead of selecting another deletion target. The former permanent Connected Containers card is removed; **View Containers** remains available within the details.

The table's **Container IPs** come from each container's reported network endpoint (`IPAddress` / `GlobalIPv6Address`). It does not substitute the IPAM subnet or gateway. Subnet/gateway information remains labelled in the details panel. Multiple network attachments may give a container multiple IP addresses. Host networking does not allocate a separate container IP; an absent address stays unavailable. A Docker bridge address is an internal endpoint and does not by itself establish LAN/VPN reachability. Published ports are reached through the Docker host as configured by the operator.
