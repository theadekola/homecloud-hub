# Network interface readings

i-Clusters combines Proxmox interface configuration with read-only telemetry from a version 3 paired node connector. IPv4/IPv6 addresses come from `ip -j address show`. Supported physical link speeds and RX/TX byte counters come from `/sys/class/net`. It does not assign addresses, restart interfaces, apply network configuration or run commands inside guests to collect these readings.

Per-interface rates use two consecutive samples: `(new bytes - old bytes) * 8 / elapsed seconds / 1,000,000` Mbps. Sampling runs every five seconds independently of Docker discovery; the dashboard refreshes on its configured interval. Counter resets, host reboots, interface replacement and long sampling gaps restart measurement. Stale/offline readings are unavailable rather than zero. Virtual bridges/VLANs do not have a negotiated hardware link speed and show **Not applicable**. Node-wide RRD history remains separately labelled.

Configured addresses and live addresses are shown together. A physical port or bridge can have no assigned address when management uses a VLAN interface. IPv6-only configurations are included. Live addresses that cannot be read are distinguished from confirmed unassigned interfaces.

## Pair a node without a connector

Use i-Clusters's **Pair Proxmox Node** dialog, run its installer on the chosen node and enter the short-lived pairing code. Repeat for each Proxmox node. The connector can report local network readings even when Docker is not installed on the node.

## Update an existing paired connector

1. Update i-Clusters from the merged repository changes first.
2. On each paired Proxmox node, download the current installer using your trusted i-Clusters HTTPS origin:

```bash
installer=$(mktemp)
curl --fail --silent --show-error --max-time 30 https://YOUR-HOMECLOUD-HOST/api/node-agent/install -o "$installer" &&
sudo bash "$installer" --update
rm -f "$installer"
```

The update verifies Python syntax and the connector version before replacing the script, preserves the existing configuration/pairing, and restarts only `homecloud-node-agent.service`. If restart fails, it restores the previous script. Existing TLS trust is required; certificate verification is not disabled. Do not revoke or re-pair an existing connector just to update it.

After two samples and the next dashboard refresh, supported readings appear. The page explains unpaired nodes, older connectors, offline/stale reports, missing counters and unsupported link speed. The paired connector's original hostname must match the Proxmox node name (an unambiguous FQDN short name is also accepted). A friendly connection label is not used to match hosts. Duplicate matching connectors must be resolved before readings are attributed to a node.

Tests use local fixtures; live node/driver compatibility still requires verification after deploying and updating the connectors.
