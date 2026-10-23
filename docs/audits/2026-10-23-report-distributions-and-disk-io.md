# Uniform distribution reports and node disk throughput

Matching donut and breakdown reports now share side-by-side presentation, typography and chart dimensions. A shared DistributionSummary component covers storage capacity, datasets, shares, snapshots, Proxmox resources, tasks, interfaces and backup archives/reports. Existing semantic rings for alerts, routes, DNS, traffic, devices, schedules, destinations, disk health, restore and retention use the same sizing rules. Values keep their original meanings, filters and selection actions. Mobile layouts retain both chart and readable breakdown; long breakdowns scroll independently.

## Why node Disk I/O was empty

Storage Performance mapped Proxmox RRD diskread/diskwrite fields directly. Proxmox node RRD publishes CPU, I/O wait, memory, capacity and network counters, but does not publish guest-style disk byte counters. I/O wait is not disk throughput. Missing values must never become measured zeroes.

Reference: https://github.com/proxmox/pve-manager/blob/master/PVE/Service/pvestatd.pm (update_node_status versus guest RRD updates).

## Connector measurements

The connector now reads /proc/diskstats and /sys/class/block every five seconds. Only hardware-backed whole leaf devices are included; partitions and logical stacks are excluded to avoid double counting. Sector counters use 512-byte units, independent of drive logical block size. No disk configuration is changed and no benchmark is run. These are physical device throughput measurements, not dataset/share throughput or a sum of guest virtual disks.

The controller validates counters, derives byte/second deltas within the same boot, and requires a stable device set and samples no more than 30 seconds apart. Reboots, counter decreases, changed device sets and missing data create gaps. An actual zero delta is a measured zero. Node matching is exact (or an unambiguous short hostname), never another node's fallback. Offline, ambiguous and stale reports do not become current measurements.

History is bounded to 2,880 thirty-second buckets and 24 hours per connector, in memory. It starts after controller startup and clears on restart; selecting a longer period does not invent older samples. Existing guest RRD throughput remains unchanged. The card explicitly describes connector coverage and unavailable readings.

## Update and verification

1. Update the application using the existing supported updater. Update the paired node connector to the current revision, manually or using owner-enabled automatic connector updates. Pairing and existing services remain unchanged.
2. Open Storage → Performance, choose the intended node and enable refresh. Allow two connector samples and the next page refresh. Compare read/write rates with read-only `iostat -dx 5` if installed, allowing for different sample intervals and device scope. Do not run a disk benchmark against production storage.
3. Confirm an idle measured interval can display 0.00 MiB/s; missing/stale telemetry must display unavailable. Select a guest and verify the chart uses its Proxmox history, not the host's physical throughput.
4. Check the named distribution cards at desktop and mobile widths; selection and filters should continue to work.

Rollback: use the existing application rollback and connector recovery procedures. The telemetry reader performs no disk writes, installs no packages, and changes no mounts, firewall, storage or guest services. Older connector revisions show an update explanation rather than fabricated data.

Validation is automated with fake disk counters, filesystems, node reports and UI fixtures. No live node access, live throughput comparison or physical disk verification was performed for this change.
