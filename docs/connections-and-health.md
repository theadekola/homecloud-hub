# Connections and connection health

Open Settings → Connections. The page uses actual configured sources and paired
connectors; it does not create the sample connections shown in the design.

- Search by name, endpoint or connection method; filter by type and status cards.
- Switch between list and grid views and sort by name or status.
- Open verifies Proxmox/API or a selected Docker Engine before navigating. Paired
  Proxmox node checks verify its heartbeat, not every Docker guest on that node.
- Test performs the applicable connection verification. Other provider checks
  request a background monitoring scan; their pending results are clearly marked.
- Manage opens the affected connection’s health guide, configuration controls and,
  when applicable, removal. Removing a connection never deletes a guest or host.
- Add Connection keeps Proxmox pairing, standalone Docker pairing and Advanced
  Direct Docker API setup. Only one active Proxmox API and one direct Docker

## Automatic checks and recovery

The owner-only `/api/connections/health` endpoint combines monitoring readings
with current connector heartbeats, versions, guest setup state and configured
provider information. It returns no tokens, private keys or CA material. An
explicit Check Setup starts a shared background monitoring scan; initial results
return promptly and the page polls partial results until the scan completes.
Ordinary reads reuse monitoring freshness and do not restart the scan on every
poll. Live timestamps are shown; stale/absent data is not labelled as a new test.

No Direct Engine entry is displayed when that optional endpoint is absent.
Reachability and setup issues are separate: a connected Proxmox API can still
need guest-execution permission, and an online connector can need an update.
Health rows distinguish offline, unverified, partial and setup-required states.
Counts refer to connection entries, including an API, paired nodes and discovered
Docker hosts; they are not a count of unique physical machines.

Manage gives scoped instructions for guest ACLs, connector version 5 updates,
offline agents, guest-agent setup and Docker checks. Copy commands does not
execute them. Connector updates can be run through the owner-only SSH popup described below,
with an explicit confirmation and fresh credentials. The manual command remains
available. Service starts outside connector maintenance remain explicit administrator
actions; no unauthenticated repair channel is introduced. Proxmox permission grants are also
manual administrator actions. Existing Install & Connect remains the integrated
repair path for supported guests, using its existing SSH identity verification,
privileged-account confirmation and readiness checks. The guide expands and
highlights the selected guest’s setup row; it never installs in a different guest.
VM power cycles are always scheduled separately by the user.

The page is available to HomeCloud owners. Other roles receive an owner-access
message and do not request the health/configuration endpoints. The existing
Proxmox and Docker authentication, action approvals, TLS checks and audit paths
remain in force.

## Validation

Regression tests cover owner authorization, secret omission, real source counts,
optional Direct Engine absence, offline/outdated connectors, guest ACL errors,
partial Docker statistics, filters, views, targeted recovery, read-only checks,
and exact-host verification before Docker host selection. Browser fixtures cover
320, 375, 390, 768, 1024, 1440 and 1920px list/grid/guide layouts. All fixtures are
local; no live infrastructure is changed during testing.

## Connector updates from Connections

Owners see a connector update notice in Connections and in the header bell when a
paired host reports older connector code than the copy bundled with the running
HomeCloud application. Update HomeCloud first to obtain a newer connector release.
The installed protocol number and SHA-256 code revision are compared; a protocol-5
connector without a revision report receives an update notice as well. Unknown
connectors without a heartbeat are not asserted to be outdated. One notice is
shown per paired host, not once for every discovered guest.

Choose **Update Connector** on the paired host or in its Manage guide. The popup
asks for a reachable SSH address, port, fresh username/password, verified host-key
fingerprint and explicit consent. HTTPS is required by the form. Credentials are
used for this operation only and are not saved. Password-based SSH plus root or
password-based sudo access must be available from the HomeCloud API server. If
that access is unavailable, the existing manual `--update` command remains a
fallback. No extra agent inside each VM/container is needed.

Before replacing anything, the fixed remote maintenance script checks that the
host's existing pairing ID and token hash match the selected paired connection.
The raw pairing token never leaves the host. It validates the bundled script's
SHA-256 and Python syntax/protocol, retains a root-only backup under
`/var/backups/homecloud-connector-*`, atomically replaces the standard connector
script, and restarts only `homecloud-node-agent.service`. Immediate restart or
service-health failures restore the previous script and attempt its restart.
The pairing configuration and authentication settings are not rewritten.

Known in-flight connector management jobs block an update; new management jobs
are rejected while it is running. Read-only measurements can briefly fail during
the connector restart. Finish outstanding actions before starting maintenance.
The popup tracks connecting, installing and heartbeat verification. It can be
closed without cancelling the operation. Success requires an online heartbeat
with the exact bundled code revision after the update started. A missing heartbeat
is reported as unverified, not successful. Check network/TLS and the host service;
a later matching heartbeat completes verification. A HomeCloud process restart
can interrupt tracking, so inspect the service before retrying. The SSH operation
does not grant new Proxmox permissions, reboot guests, restart Docker, or upgrade
host packages. It supports the standard installed paths and systemd service.

After each host update, verify Docker discovery, switch between the intended
hosts, compare running containers and CPU/memory readings, and watch for recurring
timeouts. An updated connector heartbeat alone does not verify every guest or
Docker operation. Automated fixture tests are separate from live deployment QA.
