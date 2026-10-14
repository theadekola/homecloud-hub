# Creating installation-ready VMs in HomeCloud

1. Upload a bootable installation ISO through Proxmox to storage supporting `iso` content on the target node. HomeCloud discovers existing media; it does not upload or download ISOs.
2. In Virtual Machines, choose Create VM and select the node and an active disk storage supporting `images` content.
3. Select an installation ISO. ISO storage and disk storage can be different. Changing nodes or refreshing media clears the ISO selection.
4. Choose CD-ROM first to boot the installer, or disk first with CD-ROM fallback. Without an ISO, HomeCloud creates an empty VM with disk-only boot.
5. Choose VirtIO SCSI for typical Linux guests, or SATA for guest images lacking VirtIO disk drivers. Android requires an x86 VM-compatible distribution and appropriate guest drivers; selecting an ISO does not guarantee distribution compatibility.
6. Submit creation. HomeCloud allocates a fresh VM ID and queues a stopped VM with automatic startup disabled. Check task history for completion, refresh the VM inventory, then start the VM. HomeCloud asks for fresh authentication on the containing Proxmox node, so first boot does not depend on a guest SSH server or guest agent.
7. Use Open installation console, or Console in VM details, to open Proxmox noVNC. Sign in to Proxmox with an account permitted to access that console and complete the installer.
8. After installation, eject the ISO or change to disk-first boot in Proxmox. Install the QEMU guest agent inside the guest if supported. Enabling its VM configuration does not install guest software.

## Validation and permissions

The API rechecks active/enabled storage, content compatibility, available disk space when reported, and the exact ISO volume on the selected node before allocating an ID or submitting creation. Storage read failures, deleted ISOs and incompatible targets block creation. Discovery reports per-storage permission failures while retaining media from readable stores.

Media discovery and creation require HomeCloud operator access or higher. Existing Proxmox API-token authentication and per-connection TLS verification apply. Proxmox enforces the token's own storage, allocation and VM configuration permissions. No credentials are included in console links, and console access requires its own Proxmox session.

Regression tests use injected connectors and local HTTP fixtures. They do not connect to a live Proxmox installation, create live VMs or modify existing guests. Actual OS installation and distribution compatibility still need testing on a new disposable VM after deploying this update.
