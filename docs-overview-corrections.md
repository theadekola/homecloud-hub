# Overview corrections

The service-search field filters the services widget only. Headline container totals use the full node-scoped discovered inventory and exclude stale Docker entries.

Selected-node alerts use explicit node ownership or a match to the current resource inventory. Threshold alerts now carry node ownership, and subsequent monitoring samples update existing alert records. Historical storage alerts can be matched by their resource ID. Global connection alerts remain visible in the integration diagnostics rather than being guessed to belong to a node.

Backup archive and job widgets follow the selected node. Jobs with no node restriction remain visible because they apply cluster-wide. Refresh requests a fresh dashboard sample and reloads backups independently. Backup errors appear above the widgets and in Backup Status, even if only part of the provider read failed.

A failed or partial Proxmox inventory is Unknown rather than zero in server and VM cards. Combined container totals are Unknown if Proxmox is incomplete or any configured Docker monitor is not reachable. A successfully measured empty inventory still reports zero. This is deliberately conservative; existing reported resources remain available in the service and guest widgets.

CPU and memory averages use reporting online nodes only. Storage averages use online storage entries. An absence of numeric readings remains Unknown. Initial dashboard failures offer Retry overview.

Tests cover rendered Overview interactions, filtered alert identity, node-scoped backup counts, independent refresh, service-search isolation, online averages and Unknown versus measured zero. No live infrastructure actions were used. Existing shared-storage archive entries and their provider representation remain unchanged; the page reports returned archive entries rather than deduplicating archives across nodes.
