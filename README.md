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

### Automatic workload and software discovery

The dashboard shows actual Proxmox node services and VMs/LXC, Docker API containers, and connected service checks. Unconfigured integrations are omitted. Node CPU and memory are read from the node status API; permission errors remain visible. Both the Proxmox user and privilege-separated token need PVEAuditor with propagation at `/` to read all nodes and guests. Guest counts cover resources visible to that token.

To discover software inside a host or guest, open **Dashboard → Connect discovery agent** as the owner. Run the displayed installer on each Ubuntu/Debian node, VM or LXC and enter the displayed Hub URL and private discovery key. The read-only agent inventories installed Debian packages, systemd services and Docker containers every 30 seconds. It does not execute Hub management commands. Filter by host or search software, switch to installed packages, and export JSON reports. Reports older than two minutes are marked stale. Keep the discovery key private; changing JWT_SECRET revokes all enrolled agents and also affects encrypted Proxmox credentials, so preserve that secret during normal updates. For appliances or other operating systems, use their supported API integration; Proxmox access alone cannot inspect software inside guests.

Agents use normal HTTPS verification when connecting to HTTPS deployments; install the Hub CA in the agent host trust store when using a private CA. HTTP transmits the enrollment key without encryption; use it only on your trusted homelab network. Check agent reports with `sudo journalctl -u homecloud-agent -n 100`. Remove the agent with `sudo systemctl disable --now homecloud-agent`, then remove its service/config/script files.

Updates now check GitHub every minute. The header button can request a fresh check when up to date; missing updater setup and failures are displayed when clicked. If upgrading from an older installer, run `cd /opt/homecloud-hub && sudo bash deployment/setup-updater.sh` once.

The Proxmox **Node Services** tab reads service names and states directly from Proxmox. Its start/stop/restart actions require HomeCloud admin/owner access, explicit confirmation, and Proxmox `Sys.Modify` permission for the token and user on that node. PVEAuditor alone provides monitoring, not management permission. Provider task results appear in Monitoring.
