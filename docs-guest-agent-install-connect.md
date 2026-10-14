# Guest-agent and Docker Install & Connect

The previous VM installer used `qm guest exec`, so it could install Docker only after QEMU Guest Agent already worked. That could not bootstrap a VM with missing guest access. It also completed installation without selecting the prepared host. Direct Engine configuration was independent of this node-agent path.

Owners can now expand Automatic Docker Hosts and use Install & Connect on a reported VM with guest access required. Enter the VM's reachable SSH address, port, username and fresh password through HomeCloud HTTPS. Verify the displayed host fingerprint through a trusted console. Root login or an account with working password-based sudo is required; the SSH password is also used for sudo. SSH key login is not implemented by this flow.

The API checks the VM belongs to the selected Proxmox node and is running, reads its configuration, then verifies the SSH machine's OS, privilege and identity before writes. Debian and Ubuntu are supported. If Proxmox has a SMBIOS UUID, it must match; otherwise a configured NIC MAC must match. No override is offered for failed identity checks. ISA guest-agent channels require manual review.

After explicit typed confirmation, it enables the agent option with the current configuration digest and preserves other agent options. A fixed script installs Docker and QEMU Guest Agent, starts services where possible, and checks the Docker socket. Credentials are not stored, placed in command arguments or included in audit results. Passwordless sudo cannot treat credentials as shell code. Duplicate setup for the same VM is rejected while an operation is running.

No whole-OS upgrade, automatic restart or shutdown occurs. When the VirtIO channel is missing, the UI reports that a full VM shutdown/start is needed. Complete that separately in Proxmox, then use Recheck and Connect. Without that channel, pairing cannot execute inside the VM even though packages installed successfully. Failures may leave partial package or configuration changes; inspect the VM before retrying.

For existing accessible guests, the paired-node Docker installer remains available. Both paths wait for the exact requested host to appear, verify its Engine through the paired agent and select it. Waiting is bounded to one minute and does not fall back to a different host. Node-agent reporting may take up to a minute, so a later recheck can be needed.

Verify Direct Engine performs a read-only /info request using existing settings. Not configured means no direct endpoint is saved or set in DOCKER_API_URL. Paired-node hosts do not require a direct endpoint. This button distinguishes not configured, reachable and configured-but-failing states, and does not change settings. The optional TLS configuration form remains separate. A configured endpoint does not itself prove reachability.

Validation uses simulated Proxmox calls, a local SSH fixture server, local Docker HTTP fixtures and rendered React components. No real VM, agent or Direct Engine was modified or verified during implementation. Package availability, sudo behavior and VM UUID/channel compatibility must be checked on a disposable supported VM after deployment.
