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
sudo bash /tmp/homecloud-install.sh
```

The installer detects the VM IP automatically and prints `http://DETECTED-IP:6002`. The web port defaults to 6002; the API uses port 6000 inside Docker and is accessed through the web proxy. No IP input is required. Register your owner account using the setup code printed by the installer. Choose your own name, email and password. Registration closes after the first account. The installer sets up Docker when absent, installs under `/opt/homecloud-hub`, and starts at boot. Use `sudo homecloud config` for integration credentials, `sudo homecloud restart` to apply them, and `sudo homecloud update` to pull updates from GitHub. See [PRODUCTION.md](PRODUCTION.md) for HTTPS, pinned releases, recovery and backups.

### Get your setup code and register

The installer prints `First-use setup code:` in the Ubuntu terminal. If you missed it, run this command **on the Ubuntu VM where HomeCloud is installed**:

```sh
sudo grep '^SETUP_TOKEN=' /opt/homecloud-hub/.env
```

The output looks like `SETUP_TOKEN=your-setup-code`. Copy **only the value after `=`** into the **Setup code** field. Do not copy `SETUP_TOKEN=`. Enter your name, email, password and matching confirmation, then click **Register owner account**. Sign in with your new account afterward. Keep the setup code private; registration closes after the first account is created.

For Proxmox, sign in as the owner and open **Proxmox → Add / Edit Cluster**. Test and save the cluster's host, API port, API token and TLS settings directly in the app. Nodes and guests are discovered automatically. The app supports one active cluster; credentials are encrypted on the server.

For a manual installation:

Install Docker Engine and the Compose plugin on Ubuntu, then:

```sh
cd /opt/homecloud-hub
sh deployment/generate-secrets.sh
# Set your URL, WEB_PORT and integration credentials in .env.
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

### Updates from the dashboard

For an existing Ubuntu installation, run `sudo homecloud update` once, then run the following to enable the new update service (the previous CLI version may not install it automatically):

```bash
cd /opt/homecloud-hub
sudo bash deployment/setup-updater.sh
```

New installations enable it automatically. Sign in as the owner. The header Update button replaces Sign out. An orange dot appears when the one-minute GitHub check finds a newer commit on the installed branch. Click Update to pull, rebuild and restart the deployment; the dashboard reconnects and reloads after completion. Database volumes, configuration and saved connections are retained. Other roles cannot trigger updates. Pinned releases require a manual update; local tracked changes block updates. Failures appear in the dashboard; inspect `sudo journalctl -u homecloud-updater -n 100` for details. No Docker socket is exposed to the API.


### Automatic discovery and overview

Saving a Proxmox cluster starts automatic discovery of its nodes, VMs, LXC containers, storage and node services. No separate HomeCloud agent, enrollment key or per-guest HomeCloud installer is used.

Running VMs with an existing QEMU guest agent can report services, installed packages and Docker containers through Proxmox. HomeCloud executes only fixed read-only inventory commands inside those guests and caches inventory for five minutes. Linux systemd/Debian package inventory and Windows service/installed-program inventory are supported. A missing guest agent or denied API permission is shown as an access limitation; inventory is not guessed from VM names. LXC internal applications and appliances still require access beyond the ordinary Proxmox resource API; their lifecycle, storage and resource measurements remain available.

For node status/services HTTP 403, in Proxmox open Datacenter → Permissions. Assign PVEAuditor at path `/`, with Propagate enabled, to both the backing user and privilege-separated API token. Guest inventory execution additionally requires `VM.GuestAgent.Unrestricted` on Proxmox 9 (older versions use their guest-agent execution privilege). Grant only on guests that HomeCloud should inspect. This is a powerful Proxmox permission; HomeCloud uses it for its fixed inventory commands. Node service management needs `Sys.Modify`; VM lifecycle actions need the corresponding VM management privileges.

The overview uses compact live cards. Node selection filters resources and guests; the time selector filters collected CPU/memory history. Add Widget saves visible widgets in the browser. Refresh requests a fresh measurement; Export downloads the current report. Create VM and Run Backup open their actual action forms. AI Health Check reads the current live status. The infrastructure map shows observed node/guest relationships. API reachability is a measured percentage, not a fabricated security score. Backup counts are provider-reported archives and jobs; Monitoring shows task outcomes.

For updates, use the header Update button or `sudo homecloud update`. GitHub checks run every minute. If the updater is missing, run `cd /opt/homecloud-hub && sudo bash deployment/setup-updater.sh` once.