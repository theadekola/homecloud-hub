# Restore SSH approval for paired Docker hosts

Docker connectors paired directly on a Linux host previously returned no SSH target from the action approval resolver. Protected mutations therefore fell through to the generic typed confirmation, including Docker image installation. Connectors paired through a Proxmox node already used SSH approval.

Directly paired Docker connectors now resolve an approval target scoped to the registered connector and selected Docker host. Image installation and other protected Docker mutations require a fresh Linux root or sudo password, pinned SSH host identity and a single-use action grant. Sending the typed confirmation alone returns HTTP 428 without running the action.

The SSH address comes from the selected connector's current network report. Loopback, Docker bridges and common container interfaces are excluded. Offline, stale or missing reports fail with an actionable message instead of guessing a Proxmox node address or accepting a client-supplied target. Hosts with multiple management addresses may require routing configuration so the first reported usable interface is reachable from the controller. Existing connector and Proxmox approval scopes remain distinct. Unpaired direct Docker API connections retain their existing confirmation behavior.

Docker update approvals use the existing SSH form with address and port together, username and password together, masked fingerprint and the confirmation button below host verification. Passwords are not saved for approval or replaced by a saved password.

Validation: API regression tests cover image-install challenges, rejection of typed confirmation without an SSH grant, target scoping, one-use grants, offline hosts and network address selection. A rendered UI regression verifies the image-update SSH popup and button placement. Full API and web suites and the production web build are run before publication. No live host action or container restart is performed during these tests.
