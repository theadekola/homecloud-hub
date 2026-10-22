# Live audit corrections and commercial acceptance boundary

Date: 22 October 2026. Audited release: 3.1.0-rc.3, source `dddfa381daa70831e3a319b64982c167424b34e5`.

This audit used authenticated, read-only browser navigation against a private installation. It covered the main application sections, Proxmox and Docker tabs, storage, network, backup reporting, alert history/rules, account/security settings, connector update guidance, remote-access setup and controller response-time diagnostics. Initial loading states were distinguished from settled reports. No production lifecycle action, restore, credential change, VPN grant, explicit notification test or software deployment was executed.

## Reproducible corrections

- TrueNAS monitoring previously authenticated a separate WebSocket for each report query, including a burst of concurrent logins. The revised report uses one TLS-verified authenticated session, issues its fixed read queries sequentially, preserves per-method failures, and retains modern/legacy API and snapshot-method fallback behaviour. Rejected credentials are not retried. This reduces a plausible contributor to intermittent partial-authentication failures; only a post-deployment live test can establish whether the customer's issue is resolved.
- Partial fleet refreshes replaced recent observed Docker service checks with a single pending placeholder. Recent checks now retain their original timestamps and are explicitly marked refreshing. Observations older than three minutes are not reused as reachable. Completed failed checks replace the previous status. Partial reads still do not resolve persisted alerts.
- Dashboard history now contains only the time, aggregate CPU/memory and per-node CPU/memory used by its charts. Full historical container/storage rows remain in persistence and `/monitoring`. A synthetic 2,880-sample fixture with 60 containers and eight storage rows per sample shrank from 22,017,601 to 305,281 serialized bytes (98.6%); this is not a live CPU or latency benchmark.
- Monitoring's active-alert subtitle includes informational alerts, matching the displayed total. Provider Jobs distinguishes pending, failed, unconfigured and successfully empty inventories instead of displaying unknown task counts as zero. SFTP navigation now uses the correct breadcrumb.

## Validation

Local verification: 450 API tests, 488 web tests and 31 connector tests passed. Production web build, syntax checks and release/documentation consistency checks passed. Production dependency audits returned zero findings at the time run. The supplied unapproved commercial acceptance template still fails as intended.

New regression coverage checks single-session authentication, sequential reads, legacy transport, snapshot fallback, permission failures, rejected authentication, timeouts and certificate verification against both a simulated socket and a local trusted HTTPS/WebSocket fixture. Additional tests cover recent/expired service observations and compact history without mutating persisted data.

## What this does not approve

Read-only production checks and CI do not establish guest/application restoration, isolated controller recovery, real network/VPN isolation, interrupted update recovery for customer workloads, independent security assessment, real-device accessibility or representative load/soak capacity. No customer acceptance record was marked passed. No general-availability release or commercial approval was granted.

Continue with the [commercial acceptance procedure](../commercial-acceptance.md) and [customer acceptance checklist](../acceptance-checklist.md). Keep detailed customer observations, endpoints, raw logs, contact details and commitments in a private record outside the public repository. Collect acceptance on the exact deployed revision after these corrections; repeat any affected checks after subsequent changes.
