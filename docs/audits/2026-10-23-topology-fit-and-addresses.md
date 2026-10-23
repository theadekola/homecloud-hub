# Topology sizing, runtime guest IPs and connection evidence

The topology uses compact cards and initially scales to fit the section's measured width and height. A ResizeObserver recalculates the fit when layout or inventory changes. Zoom controls operate relative to the fitted scale; resetting restores the fit. Larger views remain scrollable when users zoom in.

VM and CT addresses come from read-only runtime interface queries. VMs use the QEMU guest agent network-get-interfaces endpoint; CTs use their runtime interfaces endpoint. Prefix lengths are removed from assigned host addresses. Configuration subnets, routes, gateways and guessed addresses are never used as substitutes. Loopback, link-local and nested Docker/bridge interface addresses are excluded. Multiple reported guest addresses are preserved. API permission failures, absent guest agents and stopped/offline guests show unavailable rather than fabricated data.

Optional guest address discovery has four bounded workers, a 100 ms response budget, three-second per-request transport timeouts, per-connection/node/type/guest cache keys, a 30-second refresh interval and a 60-second freshness limit. A slow guest does not block node reporting. Failed refreshes clear addresses, while stale data, migration and offline states cannot supply another guest's IP.

An online cluster-inventory label alone does not confirm a node's direct API status. Where coverage is provided, the topology requires a successful node status read before showing it online. Nodes only referenced by guest inventory stay unknown. Their warning explicitly says Proxmox connection unconfirmed, with an explanation that this does not establish that the server is powered off. Proxmox API status and independent server reachability are different observations.

Validation includes runtime IPv4/IPv6 parsing, prefix removal, excluded interfaces, API failures, source isolation, stale samples, nonblocking discovery and unconfirmed parent-state masking. Application and API configuration are unchanged. Runtime addresses require working provider permissions and, for VMs, an enabled and running QEMU guest agent.
