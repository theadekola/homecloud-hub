# Automatic Docker guest pairing

The Docker pairing form offers automatic SSH setup for discovered Proxmox VMs and CTs. The host address is resolved from guest networking rather than the hypervisor address. The server validates placement and reads UUID/network identity from Proxmox, then verifies that identity over fingerprint-pinned SSH before creating pairing credentials. Existing connector files are not overwritten. Docker must already be running; this change does not install an Engine, restart workloads or modify guest configuration.

The shared connector bootstrap retains owner-only HTTPS access, explicit approval, fresh root/sudo credentials, protected configuration writes, controller certificate verification and failure cleanup. Docker success requires a fresh matching connector heartbeat with an online local Docker host. The UI selects the new Docker host after verification. Manual pairing remains available for external standalone hosts and existing host entries.

Validation: production build, full API/web regression suite, additional VM address/UUID resolution test, and Python fixtures for valid Docker identity, wrong-guest rejection, existing-file protection and service-failure rollback. No live user guest installation was performed.
