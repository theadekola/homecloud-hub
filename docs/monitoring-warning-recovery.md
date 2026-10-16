# Update feedback and monitoring warning recovery

A manual update check displays its progress, waits for the matching host-worker
result and then reports either a new release or “No new updates. HomeCloud is up
to date.” Successful notices dismiss after five seconds. Failed checks remain
visible; a check that does not finish within 150 seconds reports a timeout.
A check request ID prevents an older status file from being mistaken for its
result, including when timestamps fall within the same second. Older workers
can still complete checks through their changed checkedAt timestamp.

Updating the repository/container alone does not replace a previously installed
host updater script. On the HomeCloud Ubuntu controller, run the existing
`deployment/setup-updater.sh` from the updated checkout using the installation’s
normal privileged procedure. This installs the revised worker and its existing
systemd units, reapplies the HTTPS configuration and may recreate the Caddy/API
containers. Use your usual controller maintenance window. Do not run it on unrelated Proxmox nodes.

## Warnings in the reported screenshots

| Warning | What is established | Next action |
| --- | --- | --- |
| VM HTTP 403, VM.GuestAgent.Unrestricted | Proxmox denied guest command execution. This does not establish that the guest service is broken. | In Proxmox, keep the existing cluster read role. Create a role containing VM.GuestAgent.Unrestricted and assign it only at each intended /vms/ID path to the connected user and, when privilege separation is enabled, its API token. This grants powerful command execution inside that VM. Recheck discovery afterward. |
| Docker statistics unavailable | Container inventory was received, but some measurements failed. It does not mean every container is offline. | Update the paired connector to version 5. Check the named Docker host and affected running containers; recheck after the connector resumes. The updated report distinguishes deadline and Engine access failures where available. |
| Docker inventory unavailable | The old summary discarded the underlying cause, so the screenshot alone cannot prove a timeout, credentials issue or stopped service. | Select that host under Docker, inspect its connector status and Docker service. New fleet reports retain safe timeout, Engine authorization and guest-agent failure classifications. |
| Docker host or node agent offline | The paired host or its guest is not currently reporting as available. | Check the node connector, network and selected guest’s power state. This is unrelated to a Proxmox read-role grant. |
| Loading remaining provider measurements | A monitoring scan is still in progress. | Wait for completion and inspect the host warnings if it persists. It is not a permission error by itself. |
| Containers Unknown | The current inventory is incomplete. | Restore the affected Docker connections; HomeCloud must not present an incomplete count as a complete total. |

Run these read-only checks **on the affected paired Linux node/host**, not inside
an unrelated VM:

```bash
systemctl status homecloud-node-agent.service --no-pager
journalctl -u homecloud-node-agent.service -n 100 --no-pager
```

Inspect `systemctl status docker --no-pager` **inside the affected Docker host**.
Review logs locally and remove credentials before sharing them. Connector version
4 update instructions are in [page-loading-performance.md](page-loading-performance.md).
Do not restart Docker, stop guests or change permissions merely to dismiss a
warning. HomeCloud cannot repair a live host from a screenshot.

QEMU Guest Agent is for VMs. If the agent itself is missing, install the guest
OS-supported package and enable the Proxmox VM option. Debian/Ubuntu VMs can use
`apt-get install qemu-guest-agent` and `systemctl start qemu-guest-agent` as root.
If enabling the channel requires a complete shutdown and start, schedule that
separately. LXC uses the paired node route, and Windows/appliance guests need
their supported installation procedure.

Upstream privilege reference:
https://github.com/proxmox/pve-access-control (VM.GuestAgent privileges).
These changes do not grant permissions, install software in guests, or restart
live services automatically.
