# Network map: cluster, nodes and guests

The Network Map now shows the connected Proxmox cluster inventory as a tree: cluster → node → VM or LXC container. It uses the existing read-only `/proxmox` snapshot, so resources come from configured providers rather than fixed example names. Nodes refresh through the existing polling interval and the page Refresh button refreshes both network and cluster inventory. New nodes, guest migration and node recovery are reflected in subsequent snapshots.

Node cards show measured CPU and memory percentages. Unknown readings remain unavailable; offline nodes do not present stale measurements as live. Guests on offline or unconfirmed nodes have unknown state, even if an older report said running. A failed inventory read masks old live states. Partial inventory errors remain visible without removing healthy nodes. Guests whose parent is absent from node discovery are kept under a parent with unknown state.

Search keeps a matching guest's parent visible and retains every reported guest when the parent matches. Node and guest cards open details from the latest inventory. A removed or migrated selection cannot continue showing old details. VM and CT identities include node, kind and ID. Zoom controls and a keyboard-focusable scroll area support larger clusters and small screens.

The Network Health sidebar and Network Interfaces/Docker Networks preview tables were removed from the map workspace. The Interfaces, Devices and Docker Networks tabs remain available. The map shows internal hosting relationships only: it includes no external endpoints or storage devices, and lines do not assert measured packet paths, traffic or guest reachability.

Validation covers grouping, search, missing parents, offline-state isolation, guest migration, node recovery, removal of duplicate panels, card details and read-only refresh. No infrastructure configuration, guest power action or live provider change is performed by this presentation update.
