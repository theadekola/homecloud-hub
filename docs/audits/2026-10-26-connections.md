# Connection review, 26 October 2026

## Scope and evidence

Repository source review and automated tests, not live infrastructure certification.
No live administrator credentials, VM configuration, provider reachability or API
token ACLs were inspected in this session. No host, guest, pairing or provider ACL
was changed. Passing mock/local transport tests does not prove a remote server is
healthy or every management action is permitted.

| Connection | Paths reviewed and automated evidence |
| --- | --- |
| Proxmox API | Endpoint/TLS/token validation, encrypted saved connection, read-only test, replacement/removal, inventory reconciliation and separate management privileges; cluster and connection regression tests |
| QEMU guest setup | Placement, SSH fingerprint and guest identity, sudo, preserved agent options, package setup, power-cycle pending state and final agent verification; bootstrap tests include real local SSH transport |
| Guest command ACLs | Scoped administrator repair, separated user/token ACLs, explicit consent, preservation and collision/concurrency checks; guest-permissions tests |
| Paired Proxmox nodes | One-time pairing, heartbeat, revocation and bounded target service checks; node-agent and connection-action tests |
| Paired Docker hosts and VM/CT Docker | Exact selected Engine verification, fleet failures, identity/target binding and no unrelated host fallback; fleet, host selection and connection-action tests |
| Direct Docker API | TLS client certificate/key configuration, encrypted storage, read test before save and selected-host actions; docker-config and connection regression tests |
| TrueNAS | Certificate trust/hostname, credentials, permissions, protocol selection, disconnect/timeouts and read-only test explicitly excluding write permission verification; session and diagnostic tests |
| SSH/SFTP | Authentication/roles, host fingerprints, target placement, stream/idle lifecycle and transfer handling; SSH and SFTP suites |
| Automatic connector updates | Persisted per-node approval, idle-work gating, version/revision binding, staged rollout, heartbeat/receipt verification, failure pause and rollback; JS and Python update tests |
| AI | Validated model/credentials, explicit billable test consent and draft versus saved configuration; runtime configuration and frontend dialog tests |
| Notifications | Explicit real-message tests, separate save/enable, channel validation, delivery history and verified alert evidence; notification and runtime configuration suites |
| Connections UI | Read versus write capability wording, separate guest setup, failure state, evidence age and manual test versus monitor precedence; frontend suite and new evidence tests |

## Confirmed corrections

1. QEMU setup no longer rewrites an already-enabled agent option. Previously a
   read-only configuration ACL could block installation even when no change was
   necessary. Disabled options still require legitimate Proxmox write permission.
2. A denied agent-option change explains the exact VM scope, separated-token
   requirement and administrator alternative. It states package installation has
   not started. The software does not grant itself rights or broaden ACLs.
3. Connection tests no longer permanently override later monitoring. Both success
   and failure results expire; Recheck clears the local overrides. AI test results
   also expire. Failed tests indicate unverified access rather than asserting a
   machine is offline.
4. Proxmox, direct Docker, TrueNAS and guest Docker health require provider evidence
   no older than three minutes and no more than one minute into the future.
   Provider-specific observation times take precedence over snapshot envelope time.

## Remaining operational acceptance

Verify actual provider versions and allowed actions using disposable targets;
check restricted and privilege-separated tokens, first installation and repair,
provider outage/recovery, VM channel activation and connector rollback. Confirm
notification delivery with intended recipients and test mobile dialogs on physical
devices. Existing valid TLS trust, SSH/sudo access and administrator approval of
missing provider permissions remain necessary. This review does not certify
commercial readiness or claim that all configured servers are connected.
