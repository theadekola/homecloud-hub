# Application button and refresh audit, 23 October 2026

## Result and scope

The refresh audit found functional gaps: several controls refreshed only the primary list while other reports visible on the same page stayed unchanged. These gaps have been corrected. This report records a repository audit and automated UI verification, not a claim that every provider operation was executed against production infrastructure.

The static inventory covers **749 JSX button templates in 107 source files**, including the root application, all pages and shared components. Repeated resource rows can render many instances of one template. The scan found **zero missing click/submission handlers, empty click handlers or click-only actions with an implicit form-submit type**. Enclosing forms are treated as valid submission handlers; buttons with spread props need their component contract reviewed. The inventory is in `2026-10-23-button-inventory.json`; it records source file, line, label, handler summary, form/type and disabled-guard presence.

The reusable scanner is `apps/web/scripts/audit-controls.mjs`. Run it from the repository with `node apps/web/scripts/audit-controls.mjs`, or add `--json` for the detailed inventory. A regression test runs it with the web suite.

## Refresh corrections

| Page or section | Previous behavior | Corrected behavior |
| --- | --- | --- |
| Storage overview | Reloaded pool inventory only | Refreshes pool inventory, mounted pool history/content and recent storage tasks |
| Proxmox Networks / Network Interfaces | Reloaded interface inventory while throughput history stayed unchanged | Refreshes inventory and every mounted node traffic/inspection report |
| Proxmox Tasks | Reloaded the task list; chart history and completed-task details/logs could remain unchanged | Refreshes list and independent history window, then reloads the selected details and current log page |
| Traffic Analysis | Refreshed selected traffic history without discovering recovered/new nodes | Refreshes source inventory and traffic history; empty/failed discovery now has a retry control |
| Network Routing | Refreshed interfaces but not connected Proxmox metadata used by native review links | Refreshes both sources |
| Shell / SFTP host list | Refreshed Proxmox hosts but not saved SSH connections | Refreshes both sources without disconnecting existing terminals |
| Users | Refreshed accounts but not the selected account's Activity panel or session metadata | Refreshes accounts, session metadata and mounted audit activity |
| Alerts / Alert Rules | Refreshed alert/rule data without the separately loaded notification channel readings | Refreshes alert data and mounted notification readings; retains existing actions and permissions |
| Schedules compact refresh icon | Refreshed schedule inventory only | Uses the same full refresh as the page header, including targets, guests and execution history |
| Retention | Refreshed policies and restore points, leaving cleanup audit history unchanged | Refreshes mounted cleanup audit history too |
| Monitoring | A failed forced collection could prevent remaining reads; temperature readings were omitted | Starts independent reads even when collection fails, refreshes mounted temperature/hardware reports and keeps the failure visible |
| Overview retry after initial failure | Retried dashboard data only | Uses the full overview refresh, including backup and alert-attention reports |
| Docker inventory and Events | Workspace refresh coordination includes mounted volume-usage and separately managed Events reads | Shared coordinator refreshes those mounted reports with inventory |
| Backup overview and destination workspaces | Busy state could finish with only the main source while other reads remained pending | Shared refresh guard stays busy until all related mounted reads settle |

Locally managed task-log and Docker event readers also participate in workspace refreshes through `useRefreshHandler`, so parent-page refresh coordination can await their completion.

A new `useResourceRefresh` hook groups mounted report reads, coalesces repeated clicks and maintains busy state until every grouped read settles. It does not issue requests for unmounted sources, reset page filters, discard form drafts, submit mutations or disconnect terminals. The existing shared API hook retains per-source request isolation, explicit fresh-read headers, failed-read feedback and retry behavior.

Task chart-history failures now display a visible error rather than quietly keeping an old chart. Failed storage-task reads no longer display old task rows as though the refresh succeeded.

## Other button categories reviewed

| Category | Review and automated evidence | Remaining verification boundary |
| --- | --- | --- |
| Navigation, tabs, filters and pagination | Static wiring plus existing route, browser-history, selection and page-clamping regression tests | Actual device/browser combinations beyond automated fixtures |
| Details, View, Inspect and close buttons | Existing row-click/keyboard, modal focus, close/reset and changed-resource tests; added refresh tests for open activity and task panels | External native dashboards and browser restrictions |
| Docker start/stop/restart/pause/unpause/remove, stacks and cleanup | Existing exact-target, confirmation, permission, failure and host-switch tests | Real Engine compatibility and destructive actions were not run on live services |
| VM/CT creation, console, power, clone, snapshot and backup actions | Existing form validation, source selection, task envelopes, permissions and confirmation tests | Real provisioning, boot, restore and console sessions require controlled infrastructure verification |
| Storage, shares and network configuration | Existing scoped resource identity, stale-edit protection, validation, failed-save and confirmation tests | Real mounts, filesystem permissions, routing and firewalls were not changed |
| Account, security and settings controls | Existing authorization, protected-account, persistence/rollback, secret masking, import and session tests | External identity providers and physical authenticator/device behavior |
| SSH connection, connector repair/update and monitoring-tool installation | Existing fingerprint/pairing, fresh-credential, explicit-consent and failure-stage tests | Actual host authentication, package repositories and service readiness require the live host |
| Shell and SFTP controls | Existing connection lifecycle, clipboard, upload-conflict, late-response and file-operation tests | Actual transfer/terminal transport behavior under network failures |
| Export, download and reports | Existing filtered export, archive selection and missing-measurement tests | Browser download permission and external file handlers |
| Header notification and software-update controls | Existing unread/error/retry, role, missing-updater and update confirmation tests | Actual signed release installation and notification delivery |
| Provider Jobs, hardware, recovery and VPN controls | Existing source refresh, permission, task completion, revocation and isolation tests | Physical sensors, VPN device handshakes, LAN connectivity and recovery drills on user infrastructure |

A disabled control can be correct when its provider is unavailable, its role is insufficient, a required approval is missing or an action is already pending. The audit does not make those controls bypass their prerequisites.

## Automated validation

Local results: **529 web tests passed, zero failures; production web build passed; static button audit passed with zero wiring issues.** Added scenarios verify: every source requested by the refreshed workspaces; source requests are read-only; completed-task details/log refresh; pool history/content refresh; account activity refresh; discovery retry from an empty Traffic page; independent Monitoring refresh after provider collection failure; and repeated-click coalescing with a slow/failed secondary report. Existing tests cover provider permissions, confirmation flows, failure recovery, resource identity and terminal persistence. Repository CI also runs API, installer, deployment, recovery and security checks before merge.

## Live verification after updating

1. Update the application through the existing supported updater. No connector upgrade or database migration is required for these UI corrections.
2. Open each multi-report page and click Refresh once. Verify its current list, chart/history and selected detail panel all reload, with errors shown beside any unavailable source.
3. On Tasks, select a completed task and refresh; confirm the selected detail and current log page reload. On Storage, keep a pool selected and confirm history/content and recent tasks reload. On Users, keep Activity open and refresh.
4. On Network → Traffic Analysis, verify discovery can be retried even when no node was initially available. On Monitoring, verify hardware temperatures refresh with the main reports.
5. Confirm pending refresh controls remain busy and repeated clicks do not create concurrent copies of the same refresh. A failed source must not hide a healthy source's refreshed information.
6. Check the same pages on desktop and mobile. Confirm navigation, filters and open terminals remain intact.

Provider failures must be distinguished from unwired buttons. For example, an SSH package-repository failure can occur after a correctly wired Install button accepts valid credentials. This audit does not establish that the previous live monitoring-package problem has been repaired on the host.

## Source inventory

| Source file | Button templates |
| --- | ---: |
| `src/App.tsx` | 2 |
| `src/main.tsx` | 0 |
| `src/pages/AI.tsx` | 1 |
| `src/pages/ActiveAlerts.tsx` | 12 |
| `src/pages/AlertHistory.tsx` | 14 |
| `src/pages/AlertNotifications.tsx` | 12 |
| `src/pages/AlertRules.tsx` | 19 |
| `src/pages/Alerts.tsx` | 6 |
| `src/pages/Audit.tsx` | 19 |
| `src/pages/BackupDestinations.tsx` | 21 |
| `src/pages/BackupReports.tsx` | 23 |
| `src/pages/Backups.tsx` | 0 |
| `src/pages/ClusterNodes.tsx` | 20 |
| `src/pages/Dashboard.tsx` | 0 |
| `src/pages/Docker.tsx` | 9 |
| `src/pages/DockerEvents.tsx` | 10 |
| `src/pages/DockerImages.tsx` | 11 |
| `src/pages/DockerNetworks.tsx` | 14 |
| `src/pages/DockerStacks.tsx` | 7 |
| `src/pages/DockerVolumes.tsx` | 7 |
| `src/pages/Login.tsx` | 4 |
| `src/pages/LxcContainers.tsx` | 16 |
| `src/pages/Monitoring.tsx` | 19 |
| `src/pages/Network.tsx` | 3 |
| `src/pages/NetworkDNS.tsx` | 6 |
| `src/pages/NetworkDevices.tsx` | 3 |
| `src/pages/NetworkRouting.tsx` | 5 |
| `src/pages/NetworkTraffic.tsx` | 4 |
| `src/pages/Overview.tsx` | 7 |
| `src/pages/Proxmox.tsx` | 12 |
| `src/pages/ProxmoxBackups.tsx` | 24 |
| `src/pages/ProxmoxNetworks.tsx` | 16 |
| `src/pages/ProxmoxStorage.tsx` | 3 |
| `src/pages/ProxmoxTasks.tsx` | 12 |
| `src/pages/Restore.tsx` | 17 |
| `src/pages/Retention.tsx` | 21 |
| `src/pages/Schedules.tsx` | 31 |
| `src/pages/Settings.tsx` | 6 |
| `src/pages/Shell.tsx` | 7 |
| `src/pages/Storage.tsx` | 12 |
| `src/pages/StorageConfiguration.tsx` | 4 |
| `src/pages/StorageDatasets.tsx` | 17 |
| `src/pages/StorageDisks.tsx` | 9 |
| `src/pages/StoragePerformance.tsx` | 6 |
| `src/pages/StorageShares.tsx` | 19 |
| `src/pages/StorageSnapshots.tsx` | 13 |
| `src/pages/Users.tsx` | 21 |
| `src/pages/VirtualMachines.tsx` | 17 |
| `src/components/AboutSettings.tsx` | 0 |
| `src/components/AccountSecurity.tsx` | 8 |
| `src/components/ActionConfirmation.tsx` | 4 |
| `src/components/AppearanceSettings.tsx` | 4 |
| `src/components/AutomaticConnectorUpdates.tsx` | 3 |
| `src/components/BrandIcon.tsx` | 0 |
| `src/components/ClearAlertHistory.tsx` | 2 |
| `src/components/ClusterConnection.tsx` | 6 |
| `src/components/ClusterTopology.tsx` | 5 |
| `src/components/ConfigurationDialog.tsx` | 6 |
| `src/components/ConnectionActionDialog.tsx` | 4 |
| `src/components/ConnectionHealthGuide.tsx` | 12 |
| `src/components/ConnectionManager.tsx` | 24 |
| `src/components/ConnectorUpdateDialog.tsx` | 3 |
| `src/components/ContainerSSHApproval.tsx` | 3 |
| `src/components/DataTable.tsx` | 0 |
| `src/components/Discovery.tsx` | 1 |
| `src/components/DistributionSummary.tsx` | 1 |
| `src/components/DockerConnection.tsx` | 3 |
| `src/components/DockerHostSelector.tsx` | 0 |
| `src/components/DockerMonitoring.tsx` | 0 |
| `src/components/DockerUpdates.tsx` | 4 |
| `src/components/EditableSettingsSection.tsx` | 2 |
| `src/components/EmptyStateArtwork.tsx` | 0 |
| `src/components/GuestBootstrap.tsx` | 1 |
| `src/components/GuestConnections.tsx` | 8 |
| `src/components/GuestCreateFields.tsx` | 1 |
| `src/components/GuestPermissionRepair.tsx` | 4 |
| `src/components/HeaderNotifications.tsx` | 4 |
| `src/components/IntegrationChecks.tsx` | 2 |
| `src/components/IntegrationsSettings.tsx` | 1 |
| `src/components/LanAccessPolicy.tsx` | 4 |
| `src/components/Layout.tsx` | 4 |
| `src/components/NodeAgents.tsx` | 11 |
| `src/components/NodeAvailability.tsx` | 0 |
| `src/components/NotificationChannelIcon.tsx` | 0 |
| `src/components/NotificationFilterPicker.tsx` | 0 |
| `src/components/NotificationSettings.tsx` | 5 |
| `src/components/OperationsHealth.tsx` | 8 |
| `src/components/PageIcon.tsx` | 0 |
| `src/components/Pagination.tsx` | 2 |
| `src/components/PairConnector.tsx` | 6 |
| `src/components/PersistentShell.tsx` | 0 |
| `src/components/ProviderJobs.tsx` | 1 |
| `src/components/RecoveryTests.tsx` | 7 |
| `src/components/ReportLoading.tsx` | 0 |
| `src/components/SFTPBrowser.tsx` | 18 |
| `src/components/SSHAccess.tsx` | 3 |
| `src/components/SSHTerminal.tsx` | 9 |
| `src/components/SecuritySettings.tsx` | 4 |
| `src/components/SessionPreferences.tsx` | 0 |
| `src/components/StorageRegistration.tsx` | 1 |
| `src/components/SystemSettings.tsx` | 3 |
| `src/components/TableActions.tsx` | 1 |
| `src/components/TemperatureReadingDetails.tsx` | 0 |
| `src/components/TemperatureSummary.tsx` | 1 |
| `src/components/TrueNASCertificateGuide.tsx` | 0 |
| `src/components/UI.tsx` | 3 |
| `src/components/UpdateButton.tsx` | 1 |
