# Summary-card accuracy review

Reviewed against `6b433aef2a0447be18907a35614dda0248863bed` (3.1.0-rc.3). This is a repository, API-contract and simulated UI review. It is not an authenticated comparison with a customer's live Proxmox, Docker or TrueNAS installation.

## Corrections

- Headline values now distinguish a successful measured zero from loading, a failed request, incomplete inventory and an expired report. Transport failures suppress cached headline values; timestamped reports over three minutes old show **Stale**. Returned positive counts from incomplete inventories say **reported**; incomplete empty inventories do not claim zero. Previously loaded detail rows may remain visible beside an error.
- Dataset, share and snapshot explicit-refresh failures now reach headline availability independently of operation errors. Shared Stat cards and custom cards use the same availability rules.
- Backup jobs, task outcomes, archive totals and restore outcomes use their own request states. A denied jobs query does not invalidate a separately complete archive inventory. Historical retention previews remain labelled as previews, rather than current deletion results.
- Monitoring and alert summary severity counts include acknowledged conditions until resolution. Acknowledgment no longer makes a critical condition disappear from the health card.
- Guest CPU averages exclude unavailable-node and unknown-status guests, matching memory/disk availability rules. Docker image totals are unknown for read-only discovery, which does not supply an Engine image inventory; missing image sizes are not summed as zero. Failed volume-usage reads do not supply cached sizes or artificial zero reclaimable bytes.
- Latest traffic/performance cards no longer skip the last missing interval to reuse an older measurement. Traffic card labels explicitly say Latest RX/TX; historical averages and peaks remain historical calculations. Proxmox's traffic card uses its traffic request, not interface-inventory success, for availability.
- Stopped tasks without an exit result remain Unknown; reversed task durations do not enter the average as zero seconds.
- A missing TrueNAS snapshot or disk inventory is surfaced as a report limitation rather than an apparently successful empty inventory. Connection settings headline counts now account for failed or unverified health/configuration reads.

## Page and source inventory

All page modules were inspected. Search/status filters generally narrow detail tables; cards labelled Total retain full returned-inventory scope unless a node/provider selector explicitly changes the source. Period-limited cards describe returned history, not a guaranteed complete lifetime total.

| Page or section | Headline source and calculation |
| --- | --- |
| Overview / Dashboard alias | `/dashboard`: reported nodes, guests and discovered Docker resources; `/header-notifications`: unresolved alerts and update notices; `/backups`: distinct archive inventory. Node selection scopes applicable resources. |
| Proxmox overview | `/proxmox`: node/VM/CT inventory and available-node CPU cores, matched used/total memory and storage. Shared storage may repeat in explicitly labelled per-node capacity. |
| Proxmox nodes | Same available-node aggregation; shortest measured online-node uptime. |
| Virtual machines | Returned VM count, measured available-guest average CPU, matched memory and disk readings. These are all reported VM totals, not the search-filtered table. |
| LXC containers | Returned CT count and available-guest CPU, memory and root-disk readings. |
| Proxmox storage | `/proxmox/storage`: distinct local/shared storage resources, capacity and used bytes. Shared stores count once. |
| Proxmox networks / Network interfaces | `/proxmox/network`: reported interfaces, bridges and VLANs; selected node's `/proxmox/network/:node` supplies latest aggregate traffic. Internet reachability is explicitly Unknown. |
| Proxmox tasks and logs | `/proxmox/tasks?hours=...`: returned running/completed/failed counts and valid finished-task mean duration. Truncated/incomplete totals remain unknown. |
| Docker containers | `/docker` in selected-host context: containers, images, measured running-container CPU sum and memory sum, volumes and networks. Coverage and host capacity are labelled. Docker CPU can exceed 100% across multiple cores. |
| Docker images | Selected Engine's image inventory and container references. Listed image sizes are not deduplicated physical disk usage. |
| Docker volumes | Selected Engine inventory and `/docker/volumes/usage`: reference counts, measured sizes and unused sizes. Reclaimable size is not a promise that prune will recover all bytes. |
| Docker networks | Selected Engine's networks and container endpoint attachments; includes built-in networks. |
| Docker Compose stacks | Reported Compose project labels and their member-container states. This is discovered project inventory, not Compose-file deployment support. |
| Docker events | Selected host's bounded `/docker/events` history, severity classifications and last returned event; clearing is a local view cutoff. |
| Docker updates | Per-container registry-check status from `/docker/image-updates`; unknown/unsupported checks are not current-version claims. No separate numeric page-head cards. |
| Storage pools | `/storage?view=pools`: distinct online measured capacity, used/free space, returned pools, snapshots and unresolved provider alerts. Partial coverage is explicit. |
| Storage datasets and volumes | `/storage/datasets`: returned resources/mount paths and distinct pool summary; parent/child dataset usage is not added to claim physical capacity. |
| Storage disks | `/storage/disks`: returned physical-disk entries, measured sizes, known health warnings and hosts with returned disks. Unreported health stays unknown. |
| Storage snapshots | `/storage/snapshots`: returned snapshots, measured snapshot sizes, sources, oldest returned creation date and enabled TrueNAS periodic tasks. |
| Storage shares | `/storage/shares`: returned exports/mounts, enabled exports, remote mounts, read-only NFS exports and reported running SMB/NFS services. |
| Storage performance | `/storage/performance` for the selected source and period: latest history interval; connector physical disk interval where reported. Rates, historical pool readings and unavailable fields remain distinct. |
| Storage configuration | Provider configuration rows only; no numeric page-head cards. |
| Network map / Docker networks | `/network`: provider observations, reported interfaces and selected Docker Engine's networks; `/proxmox` supplies node inventory. |
| Network devices | `/dashboard` node/guest inventory plus `/docker/hosts`; complete totals require both sources, otherwise reported rows and unknown full totals. |
| Network routing | `/proxmox/network`: configured interface default gateways only. Counts do not claim to enumerate the kernel's complete routing table. |
| Network DNS | `/network/dns`: returned node resolver configurations, distinct resolver addresses and search-domain fields. Query statistics and filtering remain unavailable without a DNS provider. |
| Network traffic analysis | Selected-node historical RX/TX, average rates and peak combined rate. Mbps conversion uses bytes/second divided by 125,000. Missing latest samples remain missing. |
| Backup jobs | `/backups/jobs`, `/backups`, `/proxmox/tasks`: distinct configured jobs, accessible archives, task outcomes, known sizes and provider next-run timestamps. Sources fail independently. |
| Restore points | `/restore`: distinct archives/snapshots, known archive sizes and returned dates; separate 30-day task history supplies successful restores. This does not certify restorability. |
| Backup schedules | `/schedules`: returned provider schedules and reported future next-run time; separate seven-day task history supplies completed backup outcomes. |
| Retention | `/retention`: configured policies and reported next run; `/restore`: distinct measured archive sizes; last explicit preview: candidate removal count/size. Preview is not actual saved space. |
| Backup destinations | `/proxmox/storage`: applicable backup stores, deduplicated shared stores, measured capacity/usage. Optional node query scopes inventory before deduplication. |
| Backup reports | Returned backup task history and distinct period/node-scoped archive sizes. Success rate excludes running/unknown outcomes; mean duration uses valid finished intervals. Partial/truncated coverage is labelled. |
| Backups hub / recovery tests | Hub delegates to the sections above. Guided recovery records describe actual submitted/checkpointed test status; no separate numeric page-head cards. |
| Monitoring overview | `/dashboard`: configured service observations, available online-node uptime, unresolved alert severities and reported hosts. Resource gauges describe node averages, not capacity-weighted fleet usage. |
| Provider jobs | `/tasks`: provider-specific completeness and returned jobs/tasks; pending, unconfigured, failed and successfully empty responses remain distinct. |
| Active alerts | `/alerts`: unresolved active and acknowledged severity counts; resolved/stored counts refer to retained records. Detail status filters remain independently selectable. |
| Alert history | Stored alerts filtered by date/status/severity/source: matching records, severity counts and resolved share. Not a lifetime incident total. |
| Alert rules | `/alerts` rules: configured, enabled, disabled and severity counts. Not a count of triggered incidents. |
| Alert notifications | `/notifications`: retained delivery entries by channel and pending queue items. Queued records are not delivered messages. |
| Users | `/users`: returned account, active/inactive and role counts; no provider-inventory dependency. |
| Audit | `/audit`: returned date-scoped events, outcomes and distinct recorded users. It does not imply unlimited history beyond the API return cap. |
| Settings connections | `/connections/health`, provider configuration, pairings and notifications: verified ready sources, sources needing attention and configured notification channels. Failed health reads cannot establish a measured zero. |
| Settings notification summary | `/notifications`: configured/enabled channels and retained delivery records; last successful recorded delivery is distinct from pending queue entries. |
| Other settings sections | Configuration values, toggles and build metadata; no infrastructure measurement cards. |
| Shell / SFTP tools | Host/session/file views; no numeric infrastructure page-head cards. |
| Assistant | Read-only generated explanation of supplied measurements; no numeric page-head cards or independent security/health certification. |
| Login | Authentication form; no infrastructure measurement cards. |

## Validation boundary

Regression fixtures cover fresh zero, failed cached reads, partial empty inventories, partial positive counts, expired samples, acknowledged critical alerts, unavailable guest CPU readings, read-only Docker images, independently failed sources, and missing last history intervals. Existing host-isolation, storage deduplication, backup scope and DOM tests remain applicable. CI additionally exercises deployment and recovery; those checks do not compare a customer's actual live measurements.

A live acceptance pass still needs read-only comparison of each enabled card against the exact provider/node selected in the installed application, recording controller/connector revisions, timestamps and provider limitations. No customer endpoint was accessed during this review.
