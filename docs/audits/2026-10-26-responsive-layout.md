# Responsive layout review, 26 October 2026

## Scope and corrections

Reviewed the shared shell, all page component groups and shared popup components for intrinsic sizing, fixed-width content, wrapping, focus movement and scroll behaviour. This is a source and automated behaviour review, not a claim of physical-device certification.

The shared responsive stylesheet constrains page/card/form/fieldset widths, makes long labels and descriptions break safely, wraps headings and action toolbars, and contains technical tables/logs inside their own scroll areas. Narrow workspaces stack at 900px; popup fields stack below 768px. Provider charts, topology canvases, terminals and single-line resource tables retain their own navigation/scrolling rather than having meaningful content removed.

Popups use a flex-centred viewport container with safe-area padding, bounded dynamic viewport height, zero intrinsic minimum widths, wrapping titles and a fixed-size close control. Long fingerprints and SSH details wrap. Modal headers stay accessible while scrolling. Login content, long profile names, SFTP toolbars and AI input forms also have width constraints.

Dialog and mobile-navigation scroll locks are shared and counted. Opening a nested popup does not restore the background prematurely. The final close restores the original body styles and page scroll position. Focus restoration and notification-panel focus use preventScroll; hidden wizard panels are excluded from the dialog focus trap. The existing 16px minimum form text remains in place to avoid Safari focus zoom, without disabling user zoom.

## Page and popup coverage

| Area | Components reviewed | Applied safeguards |
| --- | --- | --- |
| Entry | Login, first-use registration, MFA | Card/input constraints; long error and label wrapping; existing keyboard zoom safeguard |
| Shell | Layout, profile menu, header notifications | Stable scrollbar space; bounded profile content; small-height notification scrolling; shared drawer lock |
| Overview | Dashboard, Overview | Constrained card/metric roots; wrapping heading/action groups |
| Proxmox | ClusterNodes, VirtualMachines, LxcContainers, ProxmoxStorage, ProxmoxNetworks, ProxmoxTasks, ProxmoxBackups | Bounded workspaces, table scroll containment, form fields and long resource names |
| Docker | Docker, DockerImages, DockerVolumes, DockerNetworks, DockerStacks, DockerEvents | Workspace stacking; table/log containment; wrapping network addresses and toolbars |
| Storage | Storage, StorageDisks, StorageDatasets, StorageSnapshots, StorageShares, StoragePerformance, StorageConfiguration | Min-width constraints; narrow workspace stacking; form, detail and technical-output wrapping |
| Network | Network, NetworkDevices, NetworkRouting, NetworkDNS, NetworkTraffic | Safe grid sizing; bounded tables and toolbars; topology remains navigable inside its surface |
| Backup | Backups, Restore, Schedules, Retention, BackupDestinations, BackupReports | Narrow workspaces and wrapped titles/actions; bounded popup forms |
| Monitoring | Monitoring, Alerts, ActiveAlerts, AlertHistory, AlertRules, AlertNotifications | Wrapped long descriptions and errors; bounded rule/history/notification forms |
| Accounts/settings | Users, Audit, Settings, ConnectionManager, ConfigurationDialog | Safe form sizing; bounded connection/error details; compact connection chooser retained |
| Tools | Shell, SSHAccess, SFTPBrowser | Wrapped file/path controls and credentials; terminal viewport sizing preserved |
| Assistant | AI | Wrapped messages and constrained composing controls |
| Shared popups | Modal, GuestBootstrap, guest permissions, connector update/maintenance, VM/CT wizard, SSH approvals, action confirmation | Viewport bounds, safe fields, wrapping header, fixed close button, nested scroll/focus handling |

## Validation and limitations

The frontend suite includes regression checks for nested scroll locks, original body-style/scroll restoration, long popup titles, hidden-panel focus exclusion and focus restoration. Existing guest setup, VM/CT, SSH, connection, navigation and page tests are also run, together with the production TypeScript/Vite build. CI repeats the repository checks before merge.

A local browser executable could not be installed in this environment. The remote preview could not access the local fixture server and its URL policy rejected data-URL previews. No browser policy was bypassed. Physical Safari keyboard, pinch-zoom and orientation checks remain deployment acceptance items. The changes do not disable zoom or hide whole-page overflow as a substitute for fitting content.
