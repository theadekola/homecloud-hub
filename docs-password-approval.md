# Password approval for protected actions

Protected actions with a verified node or guest target open the SSH password dialog rather than asking the user to copy a typed confirmation phrase. The dialog identifies the target and action. It requires a freshly entered SSH account password, trusted host fingerprint, and root or verified sudo privileges on that host. Saved SSH passwords cannot authorize protected actions, and approval passwords are not saved.

| Action | Password target |
| --- | --- |
| Install Docker through a paired Proxmox node | The selected VM or LXC guest |
| Change Docker resources through a Proxmox paired host | That Docker host: its node, VM or LXC guest |
| Start, stop, clone or delete a VM/LXC; manage its Proxmox snapshots or restore | The Proxmox node, including when the guest is stopped |
| Change node networking, DNS, firewall, tasks or services | That Proxmox node |
| Change cluster storage, cluster backup policies or HA membership | A reported Proxmox cluster node, identified in the dialog |

The guest-agent repair installer already has its own fresh SSH/sudo password form and verifies the selected VM's UUID or MAC against its Proxmox configuration. It no longer adds a duplicate typed-code prompt.

Approvals are short-lived and single-use, bound to the i-Clusters user, HTTP method, action path, complete action payload and verified target. Paired Docker approvals also bind to the selected connector host. Guest mappings use the paired node's original hostname and current cluster inventory rather than a friendly label. Missing, ambiguous or moved hosts fail closed instead of accepting an unrelated password. Fingerprint probing and authorization independently resolve the action's target and require its actual reported SSH address.

Concurrent approval requests are queued. Each dialog starts with a new empty password field. Cancelling an in-flight request cannot use its later response to approve the next request.

Installations still require SSH connectivity and the target's supported password authentication. For sudo users, the existing SSH password must also authorize the fixed sudo privilege check. The system does not run arbitrary commands during approval; privilege checks use absolute paths, and sudo passwords travel through SSH stdin rather than command arguments.

Direct Docker API, standalone connectors without a verifiable Proxmox SSH mapping, TrueNAS and other unrelated integrations retain their existing confirmation flow. i-Clusters does not guess an SSH identity or substitute another machine's password. Permissions, Proxmox API-token restrictions, existing installer eligibility checks and audit logging remain in force.

Update the API and frontend together. Tests use local fixtures and do not install software or change live hosts.
