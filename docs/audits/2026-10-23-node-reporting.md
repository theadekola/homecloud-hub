# Node outage isolation review

## Scope and changes

| Area | Finding and resulting behavior |
| --- | --- |
| Dashboard and Network Devices | Optional Proxmox section errors previously masked a successfully read resource inventory. Inventory coverage is now independent; successful resource rows and counts remain visible with node coverage notices. |
| Monitoring and hardware | Existing online-node averages and per-connector status already isolate members. Added a node coverage notice. Offline hardware remains unavailable, preserving source validation and real sensor readings on other hosts. |
| Proxmox Overview and Nodes | Existing available-node summaries retained. Per-node storage summaries now retain measured pools if another pool is unavailable. |
| VM and CT pages | Missing guest readings no longer erase all memory/disk summaries. Paired measured rows determine subtotals and capacity, with reporting coverage. |
| Storage Overview and Datasets | Full-inventory totals remain null when incomplete; cards now show explicit measured subtotals instead of hiding successful pool readings. |
| Storage, disks, snapshots and shares | Partial resource counts are labelled as reported; existing per-node reads and resource-bound details remain independent. |
| Backup Destinations and Reports | Shared storage remains deduplicated. Offline capacity is excluded and successfully measured usage remains visible if another store lacks usage. Usage percentage uses matching measured capacity. Existing archive/task coverage notices remain. |
| Restore, backup jobs and retention | Existing source-specific reads preserve accessible archives/jobs. Verification and destructive-action coverage requirements are preserved; incomplete coverage must not imply no backups or safe cleanup. |
| Network interfaces, bridges, VLANs and DNS | Explicitly offline nodes are skipped without waiting on their APIs. Successful interface counts remain visible as reported counts. Missing node diagnostics remain. Traffic initially selects an online node when available. |
| Tasks and logs | Task collection skips explicitly offline members, retaining tasks from available nodes and partial coverage. A subsequent scan retries recovered members. Explicit log requests remain tied to their selected node. |
| Storage Performance | Automatic refresh enabled by default so recovered sources are read again without reopening the page. |
| Docker and fleet views | Existing fleet isolation retained. Selected-host container summaries now preserve measured CPU/memory if another container lacks a metric and show contributor counts. Resource actions remain tied to the selected host. |
| Shell, SFTP, users and settings | These retain their own target or application-account scopes. Node outage does not redirect sessions or actions, or change application permissions. |

## Validation

Automated coverage exercises available → offline → recovered collection for storage, network and tasks; measured storage subtotals with incomplete coverage; paired guest measurements; shared-pool deduplication; missing usage; storage/dataset card refresh; and VM/CT rendering with offline guests. Full API and web suites and production build run before merge. Existing backup tests cover accessible archives surviving unavailable destinations and scan deadlines.

No live node shutdown, restart, storage mount, network change or restore is performed. These results establish repository and simulated-provider behavior, not a live physical outage exercise. The configured Proxmox API endpoint must remain reachable. API endpoint failover and quorum recovery require separate infrastructure configuration.
