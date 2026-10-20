# Page loading and connector version 5

## Behavior

- Matching page reads share an in-flight request. Recently loaded data is reused
  for ten seconds when revisiting a page; older data stays visible while it is
  refreshed. This cache is memory-only and is scoped to the authenticated account/role, selected
  Docker host and complete request path. Logout and host changes clear it.
- Successful writes invalidate cached reads. Explicit refreshes bypass freshness
  windows, and resource refresh callers await the shared request. Permission
  failures remove previously visible cached results. Requests abort once their
  final subscriber leaves; late responses from old hosts or sessions are ignored.
- Initial Overview/Monitoring reads wait at most 250ms for the monitoring scan
  itself. Completed providers and stored alerts/history are available while the
  remaining work continues. A loading notice and short shared polling complete
  the view. This is a monitoring wait budget, not an end-to-end HTTP latency SLA.
- Provider pages can read their own provider without waiting for unrelated
  providers or the whole Docker fleet. Independent provider, fleet and additional
  service scans run concurrently. Alert reconciliation and history persistence
  happen only after the complete scan, never against a partial startup snapshot.
- Docker fleet collection uses rolling work with at most four active hosts,
  and at most two per paired node. Slow hosts do not stall a whole batch.
- Optional Proxmox filesystem readings have a 250ms first-response budget. The
  bounded background reads have five-second request timeouts and a 30-second
  cache scoped to the configured connection. Missing readings remain unknown.
- Expensive summary reads coalesce for two seconds on the API. Keys include
  user, role, selected host, connection identity and query parameters. Authorization
  still runs on every request. Writes clear the cache; failures and partial
  startup snapshots are not retained. Action validation never uses this cache.

## Update paired connectors after updating HomeCloud

The server and frontend improvements apply when HomeCloud is updated. Faster
paired-node execution requires **connector version 5 on each paired Proxmox node
or standalone Docker host**. Versions 1–3 remain compatible, and existing pairings
are preserved. The Docker host panel shows a reminder for older connectors.

Version 4 sends completed results before the next poll, wakes promptly when work
finishes, and stays below the authenticated polling rate limit. Four bounded read
workers are separate from the serial write/setup lane. Expired and excess queued
jobs are rejected before execution. Docker read deadlines are passed to curl and
the guest execution wrapper. Writes are never automatically retried.

After updating HomeCloud, run this **as root on each paired host**. It reads the
controller URL (including its port) from the existing connector configuration;
it does not print or replace the pairing token:

```bash
installer=$(mktemp)
hub=$(python3 -c 'import json; print(json.load(open("/etc/homecloud-node-agent.json"))["url"].rstrip("/"))')
if curl --fail --silent --show-error --max-time 30 "$hub/api/node-agent/install" -o "$installer"; then
  bash "$installer" --update
fi
rm -f "$installer"
unset hub installer
```

Keep certificate verification enabled. If the controller uses a private CA,
install that CA in the host trust store before using the command. The update
validates the downloaded protocol version and Python syntax, preserves the
configuration and permissions, and restarts only `homecloud-node-agent.service`.
Its existing rollback behavior restores the previous script if restart fails.
No guest or Docker service restart is requested by this update.

## Verification

Regression tests cover shared reads and revisits, StrictMode, host/session
isolation, invalidation, permission failures, refresh completion, partial startup,
provider independence, old-scan rejection, fleet concurrency, optional filesystem
timeouts, immediate result delivery, failed-poll result retention, bounded queues,
expired work, separate read/write execution and connector update rollback.

Run `npm test`, `npm run build` and
`python3 apps/api/test/node-agent-python.test.py`. Performance fixtures use fake
providers and local queues; live response times still depend on the number of
hosts, provider health, network and whether each connector has been updated.

## Container statistics and connector version 5

Version 5 collects up to 16 container statistics records inside one guest execution, using bounded local Docker socket reads. This avoids a QEMU/pct round trip for every container. Concurrent snapshots for the same host and connection share in-flight work. Missing or failed measurements stay unknown; a container failure does not discard healthy container samples. Versions 1–4 retain the existing read path, and the UI recommends an update for the batched path.

After updating HomeCloud, use the existing connector `--update` flow on each paired Proxmox node or standalone Docker host. Pairing credentials are preserved. Update the connector on the Proxmox node, not inside each VM. Statistics collection needs guest curl, base64 and a working Docker socket; it does not install another Docker agent or expose an Engine TCP port.

Host selectors verify the Engine before committing a new selection. Discovery now distinguishes ready hosts from the selected connection, and setup verification reports its last actual failure and can be cancelled. Duplicate IPv4/IPv6 port rows are collapsed for display. CPU samples without valid deltas remain unknown; Linux memory subtracts reported inactive cache to match Docker CLI usage.

Discovery retains known running guests while probing them, so incremental scans do not temporarily remove unscanned hosts. Successfully enumerated stopped guests are removed; failed VM/CT enumeration marks known affected guests unavailable instead of advertising them as ready.
