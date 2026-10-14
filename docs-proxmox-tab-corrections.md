# Proxmox tab corrections

- Empty node inventory is Unknown, not Online. Failed or partial inventory summary counts remain Unknown instead of implying zero.
- The page-wide Refresh forces a Proxmox measurement and refreshes mounted Proxmox, dashboard, network, backup and settings queries. Tab refresh still runs if the forced sample fails. Existing periodic refresh and cancellation behavior is retained.
- VM, LXC, node and storage selections are constrained to the filtered inventory. Hidden selections are replaced by a visible resource, or cleared when no matches remain. Detail panels are hidden while selection is reconciled. Guest power controls submit the visible guest's ID and node.
- Overview and Nodes use node task history for the selected period, with the API's existing 500-tasks-per-node bound. Running, completed, failed and unknown task states use one interpretation.
- Shared storage summaries prefer online readings with reported capacity, retaining local stores per node.
- CephFS defaults to iso,vztmpl,backup,snippets. Unsupported VM disk and container-root content is rejected before a provider write.
- Network editing sends an explicit allowlisted clear list for emptied existing IPv4 CIDR, gateway, bridge ports and comments. The API converts this to Proxmox's delete property. Clearing is edit-only; conflicts with populated values and unsupported keys are rejected. Blank fields without an explicit clear list retain the existing compatibility behavior. Changes remain staged; Apply Configuration retains typed confirmation and permissions.
- Changing task-log pages clears old contents, shows loading, and disables download until the requested offset has arrived. Late responses from a previous selection/page are ignored.
- Shared archive deduplication occurs after node scoping. All Nodes still counts an archive once, while either eligible node retains its own archive identity for restore navigation.

Validation uses rendered React fixtures, simulated provider writes and full API/frontend regression suites. No live guests, storage configuration, network interfaces or backups were changed. TypeScript and the production build pass, with the existing bundle-size warning. Real provider and device verification remains necessary after deployment.
