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
  endpoint are supported. TrueNAS, OPNsense and Tailscale have encrypted configuration forms under Other Services, with explicit connection tests and disconnect controls.

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

Manage gives scoped instructions for guest ACLs, connector version 4 updates,
offline agents, guest-agent setup and Docker checks. Copy commands does not
execute them. Connector updates and service starts are manual commands run by
an administrator on the named node/host; no new unauthenticated repair channel
or automatic service restart is introduced. Proxmox permission grants are also
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
