# Additional guest creation options

The Create VM and Create LXC pop-ups now include the General and Network options shown in the supplied Proxmox screenshots. Existing ISO/template, storage, CPU, memory and disk controls remain.

## General

- VM/CT ID: leave blank for automatic allocation, or enter an available ID from 100 to 999999999. i-Clusters checks cluster resources for collisions; Proxmox remains the final allocator and creation never uses force. Concurrent attempts to use the same ID cannot replace an existing guest.
- Resource pool: select a permitted existing pool. The server checks availability again before creation. Node-specific discovery provides bridge suggestions and an available-ID suggestion; failed discoveries remain visible.
- Add to HA: admin/owner only. Creation returns a pending follow-up receipt, not a claim that HA is already configured. Once the creation task succeeds, click Recheck & Add to HA and complete the separate confirmation. HA is registered with desired state stopped. The guest must still be stopped; i-Clusters does not start or stop it automatically.
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

## VM creation tabs

Create VM uses General, OS, System, Disks, CPU, Memory, Network and Confirm tabs. Back/Next and arrow-key tab navigation retain edits. Next checks the current tab; Finish validates every tab and opens the first invalid field before any API request. Enter from another tab opens Confirm rather than creating the guest. Changing the node invalidates its storage/pool and ISO selection while preserving general sizing edits. Confirm lists the submitted values. Creation remains subject to the existing approval flow and creates a stopped guest.

System options include i440fx/q35, SeaBIOS/UEFI, standard/VirtIO/SPICE/serial display, VirtIO SCSI controller, guest-agent access and optional TPM 2.0. UEFI allocates an EFI disk on the chosen disk storage; TPM requires UEFI and uses that storage too. Serial display also provisions a serial socket. Disk options include SCSI/SATA, size, cache, discard and IO thread, with IO thread restricted to VirtIO SCSI Single. CPU supports sockets, cores and selected models, with a total limit of 128 vCPUs. Balloon minimum must not exceed allocated memory; zero disables it. All new enum, boolean and numeric options are checked by the API before creation or ID allocation. Defaults preserve agent access and stopped creation.

This flow creates one primary disk with optional existing ISO media. Physical CD passthrough, additional-disk/import tools and immediate start are not offered. Manage additional devices and start separately in Proxmox after task completion. Rendered UI and API fixtures verify all tabs and option serialization; they do not substitute for acceptance against each supported Proxmox version.

## CT creation tabs

Create CT uses General, Template, Disks, CPU, Memory, Network, DNS and Confirm tabs. Back/Next and keyboard navigation preserve entries. Next validates the current tab; Finish checks every tab and opens the first invalid field before submission. General includes password confirmation, public-key file loading, unprivileged/nesting and the existing role-gated HA follow-up. Passwords never appear in the confirmation summary and clear after submission, including a failed attempt.

Template discovery/refresh and template-storage filtering are scoped to the selected node. Changing node clears template/root-storage/pool choices while retaining sizing and other edits. Disks creates a root filesystem; additional mount points remain managed in Proxmox. Memory includes swap (0–1048576 MiB, zero disables it), validated and serialized by the API. Network preserves static addresses when switching modes but omits them from DHCP/None/SLAAC submissions. DNS accepts up to three IP addresses or leaves node defaults. Creation remains stopped and existing approval, privilege and HA checks apply.

UI fixtures exercise all eight tabs, reviewed/submitted values, password secrecy and failure cleanup, node changes, template refresh, keyboard navigation, SSH file validation, IPv4/IPv6/DNS validation and swap. API fixtures verify swap bounds and explicit zero serialization. These checks use simulated providers; no live container was created during implementation.
