# Connections and connection health

Open **Settings → Connections** to manage Proxmox, paired node connectors, Docker,
TrueNAS, the AI Assistant and external notification delivery. Other resource pages
link here instead of opening duplicate connection forms. Existing
`Settings?tab=Notifications` bookmarks redirect to Connections → Notifications.

## Connected and Needs Setup

- **Connected** contains sources with online checks and no reported setup issues,
  plus VMs whose QEMU Guest Agent has responded. Source counts include API
  connections, paired nodes and Docker hosts, rather than unique physical machines.
- **Needs Setup** contains offline, unverified and incomplete sources. Manage or
  Fix Setup opens the affected source’s health guide. Search by name or address,
  filter by provider, switch list/grid views and sort by name or status.
- Open, Test and Manage stay together on one row in source cards. Optional remove
  and connector update actions can use a separate row.
- **Open** verifies the applicable API, connector heartbeat or exact Docker Engine
  before selecting its host and navigating. **Test** verifies without navigation.
  A paired node heartbeat does not verify all of its Docker guests. TrueNAS uses
  its read-only provider test. AI tests require confirmation and can incur charges.
- **Recheck Connections** refreshes provider checks. Background checks and errors
  remain visible. Failed reads do not turn unverified sources into connected ones.
- Removing a saved connection or revoking a connector removes i-Clusters access,
  without deleting its hosts or guests. Connector service removal is separate.

The workspace opens in Grid view. On desktop, source cards and VM guest-access
cards use four columns; tablet layouts use two and phone layouts use one. The
Grid/List switch applies to both inventories. Connection state sits beside the
source title, and the node and last-check time share a line. Long source names
and endpoints retain their full values in hover text. Check times use a compact
date and time, with the complete timestamp available on hover.

## Add a connection

**Add Connection** offers Proxmox API, Proxmox node pairing, standalone Docker,
TrueNAS, AI Assistant and notification channels. Direct Docker HTTPS API setup
is under Advanced connection methods. One active Proxmox API endpoint and one
optional direct Docker API endpoint are supported. Saving replaces that endpoint.
After connecting Proxmox, pair each node when Docker guest discovery is needed.
Secrets stay encrypted on the server and saved values are never shown in forms.
A saved configuration is distinct from a successful delivery or connection test.

## VM guest access

Each VM is identified by its Proxmox node and VM ID. Read-only checks distinguish
verified agents, disabled options, stopped VMs, permission failures and unavailable
agents. An unavailable probe cannot prove whether the package is missing or the
service is stopped. Checks run in the background so slow guests do not hold up the
page. **Recheck VMs** explicitly refreshes those checks.

**Set Up Guest Agent** or **Install / Start Guest Agent** opens the selected VM’s
SSH installer. On Debian/Ubuntu it installs QEMU Guest Agent if missing, enables
its Proxmox option only when disabled, preserves other agent options and starts its service when the
VirtIO channel exists. This operation does not install Docker. The verified SSH
host must match the selected VM’s UUID or configured adapter. Use that VM’s Linux
SSH password with root or sudo access, rather than an application or Proxmox login.
Other operating systems require their supported agent installation procedure.

An already-enabled agent option does not require a configuration write. If enabling
the option is denied, setup stops before package installation and explains the
`VM.Config.Options` grant at `/vms/ID` for the user and any privilege-separated
token. A Proxmox administrator can alternatively enable the option in VM Options.
The guest-discovery permission repair grants guest command access; it does not
grant VM configuration access.

Manual provider test results expire after three minutes and yield to newer health
observations. An unsuccessful test is shown as unverified, since permissions or
TLS failures do not establish that a server is offline. Provider health uses the
actual observation timestamp; old, invalid or excessively future-dated readings
cannot establish a current connection.

**Fix Permissions** opens the existing scoped administrator repair and selects the
affected VM when it is still pending. It needs a separate Proxmox administrator
login and explicit consent. Existing user and privilege-separated token grants
are preserved. A stopped VM must be started separately before installing or testing.

Successful verification displays a success message and closes the dialog after
two seconds. Verified VMs move to Connected. When a full shutdown and start is
needed, the dialog states that requirement and remains pending until Recheck
Guest Agent verifies it. No guest is restarted automatically.

## Optional Docker guest setup

Needs Setup lists eligible unconnected Debian/Ubuntu guests separately. Install
Docker only in guests intended to run Docker; application or appliance monitoring
does not imply that Docker should be installed. **Set Up Docker** explains the
selected target and required guest SSH account before installation. LXC setup uses
the paired node and enables nesting; QEMU setup uses supported guest access or the
existing verified SSH bootstrap. QEMU Guest Agent setup does not apply to LXC.

After installation, i-Clusters waits for discovery and verifies the exact selected
Docker Engine. Unrelated ready hosts cannot satisfy this check. Failed verification
remains retryable. Success closes the popup after its message, removes the guest
from pending setup and selects the verified host. The Docker page contains host
selection and resource management, with Manage Connections links to this page.

## Notifications

Connections → Notifications contains channel setup, enabled delivery preferences,
severity/recovery settings, explicit tests and delivery history. All nine supported
channels retain their existing credential forms. A test sends a real message and
requires confirmation; it does not silently save or enable a draft. Configuration
saves show success and close automatically. Failed tests and saves retain the form.
Notification links from Alerts and Integrations point here. Old notification URLs
continue to work through the central settings route.

The page and its private configuration endpoints require a i-Clusters owner. Other
roles receive an access message without requesting private connection or delivery
data. Existing TLS verification, SSH fingerprints, target privilege checks,
confirmation grants and audit records remain in force.

## Connector updates from Connections

Owners see a connector update notice in Connections and in the header bell when a
paired host reports older connector code than the copy bundled with the running
i-Clusters application. Update i-Clusters first to obtain a newer connector release.
The installed protocol number and SHA-256 code revision are compared; a protocol-5
connector without a revision report receives an update notice as well. Unknown
connectors without a heartbeat are not asserted to be outdated. One notice is
shown per paired host, not once for every discovered guest.

Choose **Update Connector** on the paired host or in its Manage guide. The popup
looks up the paired Proxmox node’s IP from the configured cluster, avoiding a
requirement for short hostnames such as `node01` to resolve inside the i-Clusters
container. Only an exact or unambiguous node-name match with a valid IP is used.
Standalone hosts, unavailable cluster readings and ambiguous names retain manual
SSH address entry. The popup asks for the SSH port, fresh username/password,
verified host-key fingerprint and explicit consent. Use **Read SSH Fingerprint**
to retry after correcting an address or a temporary connection failure. DNS errors
explain that the address must be reachable from i-Clusters; they do not enable the
verification checkbox or bypass host identity checks. HTTPS is required by the form. Credentials are
used for this operation only and are not saved. Password-based SSH plus root or
password-based sudo access must be available from the i-Clusters API server. If
that access is unavailable, correct SSH access before retrying the button.
No extra agent inside each VM/container is needed.

Before replacing anything, the fixed remote maintenance script checks that the
host's existing pairing ID and token hash match the selected paired connection.
The raw pairing token never leaves the host. It validates the bundled script's
SHA-256 and Python syntax/protocol, retains a root-only backup under
`/var/backups/iclusters-connector-*`, atomically replaces the standard connector
script, and restarts only `iclusters-node-agent.service`. Immediate restart or
service-health failures restore the previous script and attempt its restart.
The pairing configuration and authentication settings are not rewritten.

Known in-flight connector management jobs block an update; new management jobs
are rejected while it is running. Read-only measurements can briefly fail during
the connector restart. Finish outstanding actions before starting maintenance.
The popup tracks connecting, installing and heartbeat verification. It can be
closed without cancelling the operation. Success requires an online heartbeat
with the exact bundled code revision after the update started. A missing heartbeat
is reported as unverified, not successful. Check network/TLS and the host service;
a later matching heartbeat completes verification. A i-Clusters process restart
can interrupt tracking, so inspect the service before retrying. The SSH operation
does not grant new Proxmox permissions, reboot guests, restart Docker, or upgrade
host packages. It supports the standard installed paths and systemd service.

After each host update, verify Docker discovery, switch between the intended
hosts, compare running containers and CPU/memory readings, and watch for recurring
timeouts. An updated connector heartbeat alone does not verify every guest or
Docker operation. Automated fixture tests are separate from live deployment QA.

## Service checks and starts from Manage

The connection health guide uses buttons instead of terminal commands:

- **Check Installed Connector** and **Check Connector & Logs** read the paired
  host's connector service, installed protocol and bounded, redacted service logs.
- **Start Connector** starts only an inactive connector service. Success requires
  both an active service and a fresh authenticated heartbeat to i-Clusters.
- **Check Docker** reads Docker's service and Engine status, container counts and
  available resource readings on the selected host or guest.
- **Start Docker** starts only that target's inactive Docker service, then checks
  the service and Engine. It does not restart an already active service.

These owner-only actions use the same SSH address lookup and fingerprint checks
as connector updates. The form requires HTTPS and fresh root/sudo SSH credentials
for the paired host. Credentials are not saved, appear in neither audit records
nor command arguments, and are cleared from the form when submitted. Starting a
service requires explicit consent. Read results remain visible for inspection;
verified starts show a success message and close their action dialog. Failure or
missing heartbeat stays open without claiming that the connection is restored.

Every action verifies the existing pairing ID and token hash on the SSH host.
Connector actions always target the paired host. Docker guest actions use the
exact reported QEMU/LXC identity through that host and its existing guest access.
Standalone pairings cannot target Proxmox guests. Only four fixed operations are
accepted; users cannot submit shell commands. Maintenance is serialized with
connector updates and other management jobs. No package installation, guest
restart, reboot, token rewrite or Docker restart is part of these service actions.
Direct Docker API connections can run their existing API checks; pairing is
required to manage their host service. These actions require the standard Linux
connector installation and systemd. Unavailable SSH or VM guest access must be
restored before a remote action can complete.

## Successful connection feedback

Connection popups show an accessible green success screen for two seconds, then
close automatically. This applies to saved-and-verified Proxmox/direct Docker
connections, verified pairing, SSH/SFTP login and password approval, verified
integration connections and connector updates with a matching fresh heartbeat.
Guest setup closes only after the selected Docker Engine is actually verified;
package installation, a queued request or a required guest power cycle is not
connection success. Failed, pending and unverified operations stay open.

Tests using unsaved integration details keep the form open so the user can save
those details. Saving that same tested draft shows success and closes. Saving
untested integration configuration keeps the form open for Test Connection.
Proxmox and direct Docker save operations already verify before saving. Closing
a popup manually cancels its timer; a cancelled SSH login also releases a newly
created session that was not handed to the shell or file browser.

Configuration saves also show the two-second success screen, including integration
settings saved without a preceding connection test, DNS, staged network/gateway
settings, firewall rules, Docker networks/volumes, storage registration, shares,
retention policies and schedules. Overview and monitoring customization show the
same feedback when Done is selected. Saving settings confirms the save only;
network changes that need applying remain labelled as staged. Failed saves retain
the editor and its draft. Draft-only connection tests keep unsaved settings open
until Save Configuration is selected. Pending provider jobs are not labelled as
completed configurations. Closing or reopening an editor clears its previous
success state.

## Overview backup inventory

The Overview Backups card counts stored Proxmox backup archives visible through
its configured API token. Schedules, VM snapshots, TrueNAS snapshots and Docker
volumes are separate resources and are not added to this count. The history-period
selector controls resource charts, not backup-archive age.

A zero count requires a successful scan. Offline nodes, inactive/disabled backup
storage, permission errors and malformed provider responses mark the inventory
incomplete and show Unknown. When online nodes report no backup storage, the card
explicitly says no Proxmox backup storage is visible. Verify the token's storage
access and compare the Backups/Restore Points views with the provider's own archive
listing before treating a count as proof of protection. Discovery does not verify
archive integrity or a successful restore.

## Docker event details

Docker → Events keeps source, object and View labels on one line. Wide event logs
scroll inside their card. The Action column uses readable event names; hover it
for the original Docker action.

Details stay closed until **View** is selected in the log or timeline. The panel
explains the selected event, identifies its object and timestamp, and reports an
exit code only when supplied by Docker. A prepared or started exec command does
not establish whether it succeeded. **Close** at the top hides the details until
another View action. Background refresh does not open or replace the selection.
Recorded commands and the original JSON remain in expandable technical sections;
Copy Event copies the original event without running its command.
