# Additional guest creation options

The Create VM and Create LXC pop-ups now include the General and Network options shown in the supplied Proxmox screenshots. Existing ISO/template, storage, CPU, memory and disk controls remain.

## General

- VM/CT ID: leave blank for automatic allocation, or enter an available ID from 100 to 999999999. HomeCloud checks cluster resources for collisions; Proxmox remains the final allocator and creation never uses force. Concurrent attempts to use the same ID cannot replace an existing guest.
- Resource pool: select a permitted existing pool. The server checks availability again before creation. Node-specific discovery provides bridge suggestions and an available-ID suggestion; failed discoveries remain visible.
- Add to HA: admin/owner only. Creation returns a pending follow-up receipt, not a claim that HA is already configured. Once the creation task succeeds, click Recheck & Add to HA and complete the separate confirmation. HA is registered with desired state stopped. The guest must still be stopped; HomeCloud does not start or stop it automatically.
- LXC unprivileged: enabled by default. Operators cannot create privileged containers. Admin/owner selection of privileged mode requires typed confirmation.
- LXC nesting: opt in when the workload requires it.
- LXC root password: enter it twice. Both fields clear after submission, including failed submissions. Passwords do not appear in creation results.
- Public SSH keys: enter text or load a public key file up to 64 KiB. Private-key files are rejected. SSH availability and root-login policy still depend on the OS template.

## Networking

VMs support no network device, a bridge, VirtIO/E1000/E1000E/RTL8139/VMXNET3 models, VLAN tag, explicit unicast MAC or automatic MAC, and the NIC firewall flag. VM IP configuration remains inside the guest OS, as in the native Proxmox VM network screen.

LXCs support interface name, bridge, VLAN, MAC, firewall, IPv4 DHCP/static/none and IPv6 static/DHCP/SLAAC/none. Static addresses require a valid family-specific CIDR. Gateways require the corresponding static mode. DNS servers accept up to three IPv4/IPv6 addresses; an optional search domain is supported. Empty DNS fields retain provider defaults.

Firewall enables the NIC option only. Datacenter/node firewall settings and rules remain managed in Proxmox. VLAN tags must match the network's existing VLAN configuration. These creation fields do not alter bridges, VLAN infrastructure or any existing guest.

## HA follow-up limits

The receipt is bound to its creator, guest identity, node and creation task, expires after 30 minutes, and is held in the API process. It requires admin access and confirmation, successful task completion, matching guest placement and stopped runtime state before registration. Completed requests are idempotent. Failed or running creation tasks issue no HA write. If the API restarts, the receipt expires, or the creation page is left before completing this step, manage HA through Proxmox; do not recreate the guest to retry HA setup. A configured Proxmox HA environment and suitable storage/networking are prerequisites.

## Validation

API tests cover serialization, malformed network settings, IDs in use, pool verification, password/DNS/key validation, privilege and confirmation gates, creation-bound HA, pending/failed tasks, stopped state and duplicate follow-up. Rendered UI tests verify the displayed fields are submitted, credentials clear and operators retain safe defaults. Creation stays stopped with onboot disabled. No existing live VM, container, node or network was changed during development.
