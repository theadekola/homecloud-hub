# HomeCloud Hub 3

A self-hosted web interface for real Proxmox, Docker, TrueNAS, OPNsense and Tailscale API connections. The application has no demo mode, seeded infrastructure records, random charts or simulated successful operations.

## Implemented integrations

| Integration | Reads | Actions |
| --- | --- | --- |
| Proxmox | Nodes, VMs, LXC, storage, networks, backup jobs, archives and tasks | Create an empty VM; guest lifecycle; VM snapshot; backups; create/toggle/delete backup schedules; retention update/preview/prune; restore archives into unused guest IDs |
| Docker | Engine information, container measurements/logs, images, volumes, networks and existing Compose projects | Create/lifecycle/remove containers; create/remove volumes and networks; prune unused resources; start/stop/restart existing Compose project containers |
| TrueNAS | Pools, datasets, disks, snapshots, alerts, snapshot schedules and jobs | Create datasets and snapshots; delete/roll back snapshots; start pool scrubs; create/toggle periodic snapshot tasks with retention lifetimes |
| OPNsense | System status, interfaces and services | Start/stop/restart services; reload an interface |
| Tailscale | Tailnet devices, addresses, authorization, last-seen timestamps and routes | Authorize/deauthorize/remove devices; enable advertised routes or disable routes |
| Other services | Server-configured HTTP health endpoints | Monitoring only |

Monitoring samples every 30 seconds. Charts contain collected Proxmox node averages, including gaps for unavailable measurements. Alert rules evaluate actual CPU, memory and storage measurements. Connection errors and TrueNAS alerts are also tracked. Acknowledgment does not repair a condition.

## Deployment

Install directly from GitHub on Ubuntu:

```sh
sudo apt-get update
sudo apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/theadekola/homecloud-hub/main/install.sh -o /tmp/homecloud-install.sh
less /tmp/homecloud-install.sh
sudo bash /tmp/homecloud-install.sh --repo https://github.com/theadekola/homecloud-hub.git --url http://YOUR-UBUNTU-IP --email admin@example.com
```

Replace the IP and email. Save the generated password. The installer sets up Docker when absent, installs under `/opt/homecloud-hub`, and starts at boot. Use `sudo homecloud config` for integration credentials, `sudo homecloud restart` to apply them, and `sudo homecloud update` to pull updates from GitHub. See [PRODUCTION.md](PRODUCTION.md) for HTTPS, pinned releases, recovery and backups.

For a manual installation:

Install Docker Engine and the Compose plugin on Ubuntu, then:

```sh
cd /opt/homecloud-hub
sh deployment/generate-secrets.sh
# Set your URL, admin email and integration credentials in .env.
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api
```

See PRODUCTION.md for connector configuration and validation. Only configure integrations you use. Missing integrations show `not-configured`; API failures are visible and never replaced with demo data.

## Development checks

```sh
npm install
npm run build
npm test -w apps/api
```

On Windows, if your environment prevents npm workspace links, run `npm install --workspaces=false` separately in `apps/api` and `apps/web`, then run the root build. TLS regression tests use OpenSSL; they are skipped if it is unavailable.

## Boundaries

Provider API versions and token permissions affect functionality. TrueNAS supports JSON-RPC and an explicit legacy WebSocket mode; incompatible methods surface errors. OPNsense interface fields vary by release. This is one connection per provider, not a multi-cluster inventory.

No Compose file deployment, generic Docker-volume/database backup runner, network discovery, firewall-rule editor, email/Discord notifications, app two-factor login, automatic software updates, security scanner or invented health score is provided. Restore, prune and other sensitive actions require typed confirmation. Asynchronous tasks are reported as queued; provider task history shows their outcome.
