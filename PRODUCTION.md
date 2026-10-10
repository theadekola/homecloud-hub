# Ubuntu deployment and live configuration

## Start

### Install from GitHub on Ubuntu

On Ubuntu with systemd, install from the public `theadekola/homecloud-hub` repository:

```sh
sudo apt-get update
sudo apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/theadekola/homecloud-hub/main/install.sh -o /tmp/homecloud-install.sh
# Inspect the downloaded installer before running it.
less /tmp/homecloud-install.sh
sudo bash /tmp/homecloud-install.sh
```

The installer detects the VM's IPv4 source address from its default route and prints `http://DETECTED-IP:6002`. No IP or URL argument is required. If no default route is present, it selects a global address from a non-Docker interface; it stops if no usable address exists. `--url` remains available for a specific hostname or interface. Detection runs at installation time; a DHCP address change means you must use the VM's new address in your browser.

The default web port is **6002**, mapped to Caddy's internal port 80. The API runs on **6000 inside Docker**, with requests proxied through the web port. The API port is not published to the host. Chromium browsers block port 6000 as an X11 port, so the browser never connects to it directly. `--port` overrides the web port if 6002 is occupied. HTTPS uses `--https-port` (default 8443). Public port settings are stored as `WEB_PORT` and `HTTPS_PORT` in `.env`.

For automatic HTTPS, use `--url https://homecloud.your-domain.example --port 80 --https-port 443`, with DNS pointing at the server and public certificate validation reaching Caddy. If a reverse proxy already manages ports 80/443, proxy to HomeCloud's HTTP port and set `WEB_ORIGIN` to the browser's HTTPS URL. The installer expects `--url` without a port; supply ports through the separate flags. `--ref v3.0.0` optionally pins an existing Git tag. The installer downloads and builds source, installs Docker from its official apt repository when absent, generates secrets, and enables the `homecloud-hub` systemd service. Existing Docker installations must already have the Compose plugin. It never removes conflicting Docker packages automatically.

Save the **first-use setup code** printed during installation. Open HomeCloud, enter your name, email, password (at least 12 characters) and setup code to create the owner account. The code is also stored as `SETUP_TOKEN` in `/opt/homecloud-hub/.env`. Registration is available only while the users table is empty; concurrent registration requests cannot create multiple owners. Sign in after registering. Administrators add subsequent users from the Users page. The installer no longer requires an email or generates an account password.

If you missed the setup code in the installation output, retrieve it **on the Ubuntu VM where HomeCloud is installed**:

```sh
sudo grep '^SETUP_TOKEN=' /opt/homecloud-hub/.env
```

The output looks like `SETUP_TOKEN=your-setup-code`. Copy **only the value after `=`** into the registration screen's **Setup code** field, without the `SETUP_TOKEN=` prefix. Fill in your name, email, password and matching confirmation, then click **Register owner account**. Sign in with the new account afterward. Keep the setup code private.

Application files live in `/opt/homecloud-hub`; integration credentials are configured in its `.env` or the Proxmox form. Installation requires internet access to GitHub, Docker's package repository and container registries. A private repository needs a separate authenticated checkout and the manual deployment below; tokens are not accepted in installer URLs.

```sh
sudo homecloud status
sudo homecloud config
sudo homecloud restart
sudo homecloud logs
sudo homecloud update
sudo homecloud stop
sudo homecloud start
```

Updates pull the current branch with `git pull --ff-only`, rebuild and check container health. They preserve `.env`, certificates, runtime files and named database volumes. Back up these before updating; database migrations are not automatically rolled back. Pinned releases require manually selecting the next release in the checkout. If installation fails after the checkout is placed in `/opt`, fix the reported issue there and run `sudo docker compose -f /opt/homecloud-hub/docker-compose.yml --project-directory /opt/homecloud-hub up -d --build --wait`; inspect `sudo journalctl -u homecloud-hub` and `sudo homecloud logs`.

### Manual deployment

Install Docker Engine and the Compose plugin using https://docs.docker.com/engine/install/ubuntu/ . Copy this project to `/opt/homecloud-hub`. Run `sh deployment/generate-secrets.sh` once, then edit `.env`. Keep its generated database password, JWT secrets and setup code. The first owner registers in the browser; `ADMIN_EMAIL` and `ADMIN_PASSWORD` are no longer used. Existing database accounts remain intact when updating.

For initial private LAN testing:

```env
DOMAIN=:80
WEB_PORT=6002
HTTPS_PORT=8443
WEB_ORIGIN=http://YOUR-UBUNTU-IP:6002
```

For HTTPS, configure DNS and a real hostname with Caddy:

```env
DOMAIN=homecloud.your-domain.example
WEB_PORT=80
HTTPS_PORT=443
WEB_ORIGIN=https://homecloud.your-domain.example
```

Use HTTPS or a trusted private access tunnel for credentials. Do not expose privileged connectors directly to the internet.

To change an existing installation's port, run `sudo homecloud config`, set `WEB_PORT=6002` and `WEB_ORIGIN=http://YOUR-UBUNTU-IP:6002`, then run `sudo homecloud restart`. Legacy installations without port variables keep ports 80/443. Existing accounts show the usual sign-in screen. To initialize an empty legacy database, set a new `SETUP_TOKEN` using `openssl rand -hex 16` and restart; never delete existing accounts to re-open setup.

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api web caddy
```

## Proxmox

The application owner can open **Proxmox → Add / Edit Cluster** to configure a connection without editing `.env`. Enter a cluster name, host/IP, port (usually 8006), API token ID (`user@realm!token-name`) and token secret. Keep SSL verification enabled and paste a public PEM CA certificate when using a private CA. Test Connection previews discovered nodes; Save & Load Cluster validates access again, saves the connection and refreshes the page without restarting the API. A standalone Proxmox server also works.

One active Proxmox connection is supported. Saving replaces it and overrides the environment configuration. This form uses API tokens, not account passwords, SSH keys or automatic migration settings. Permissions for management actions must be assigned separately in Proxmox. Only owners can test, read or change connection settings. Secrets and the CA are never returned to the browser or written to audit details.

Saved connection details are encrypted with AES-256-GCM in `runtime/proxmox-connection.json`, using a key derived from `JWT_SECRET`. Back up that file and the matching `.env`; changing `JWT_SECRET` requires reconfiguring the saved connection. Removing this file restores the `.env` connection after the next refresh. Monitoring history remains installation history across connection changes.

Set `PROXMOX_URL`, `PROXMOX_TOKEN_ID` and `PROXMOX_TOKEN_SECRET`. Grant the token only required permissions. Reads generally require Sys.Audit, VM.Audit and Datastore.Audit; lifecycle/creation/backup/restore/prune need the corresponding VM and datastore privileges. Managing cluster backup schedules needs Sys.Modify. Check your Proxmox release's API permission requirements.

Keep `PROXMOX_VERIFY_TLS=true`. For a private CA, put its PEM file in `secrets/ca/` and set `NODE_EXTRA_CA_CERTS=/run/homecloud/ca/your-ca.pem` in `.env`.

Backup forms take exact node names, guest IDs, storage IDs and Proxmox calendar expressions, e.g. `02:00` or `sun 03:00`. Jobs run inside Proxmox even if HomeCloud Hub is stopped. Manual run supports node-specific jobs; cluster-wide jobs still run through Proxmox. Restores require a new unused guest ID and a destination disk storage ID. The backup archive must be accessible from the destination node.

## Docker

Configure a protected Engine API endpoint. Direct Unix sockets and SSH URLs are not accepted by this HTTP connector; use mTLS or a suitable private gateway.

```env
DOCKER_API_URL=https://YOUR-DOCKER-HOST:2376
DOCKER_TLS_CA=/run/homecloud/docker/ca.pem
DOCKER_TLS_CERT=/run/homecloud/docker/cert.pem
DOCKER_TLS_KEY=/run/homecloud/docker/key.pem
```

Place the files in `secrets/docker/`. See https://docs.docker.com/engine/security/protect-access/ . Docker API access is highly privileged. Do not use an unauthenticated public port 2375. Existing Compose projects are discovered using container labels; project actions operate on existing containers, not Compose files.

## TrueNAS

```env
TRUENAS_URL=https://YOUR-TRUENAS-HOST
TRUENAS_API_KEY=YOUR-API-KEY
TRUENAS_API_MODE=jsonrpc
TRUENAS_TLS_CA=/run/homecloud/ca/truenas-ca.pem
```

JSON-RPC connects over WSS to `/api/current`. For CORE or older SCALE, set `TRUENAS_API_MODE=legacy` to use `/websocket`; override `TRUENAS_WS_PATH` only if your reverse proxy changes the path. Snapshot methods fall back from `pool.snapshot.*` to `zfs.snapshot.*` only when a method is absent. Unsupported API methods and insufficient privileges remain visible. These transports were tested against local protocol fixtures, not every TrueNAS release.

Periodic snapshots have a provider-managed retention lifetime. Rollback does not force unmounts or automatically delete newer snapshots. Pool scrub submits a TrueNAS job; inspect Monitoring for job state. Snapshot listings are bounded to 1,000 results.

## OPNsense

```env
OPNSENSE_URL=https://YOUR-FIREWALL
OPNSENSE_API_KEY=YOUR-KEY
OPNSENSE_API_SECRET=YOUR-SECRET
OPNSENSE_TLS_CA=/run/homecloud/ca/opnsense-ca.pem
OPNSENSE_API_STYLE=current
```

Use a dedicated API user with privileges for the system status, interface overview and service endpoints. `OPNSENSE_API_STYLE=legacy` uses older camel-case interface endpoint names. Service control and interface reload can affect your connection, so sensitive actions require confirmation.

## Tailscale

```env
TAILSCALE_TAILNET=YOUR-TAILNET
TAILSCALE_API_KEY=YOUR-ADMIN-API-KEY
```

Use a Tailscale admin API credential, not a device enrollment key. Device authorization, removal and route operations require appropriate API access. Expired credentials produce visible errors. Device last-seen timestamps are not a guarantee of current connectivity. A custom authenticated API gateway can be set with `TAILSCALE_API_BASE`; optional `TAILSCALE_TLS_CA` supplies its CA file.

## Other service health endpoints

```env
SERVICE_CHECKS_JSON='[{"name":"Jellyfin","url":"http://YOUR-MEDIA-HOST:8096/health"}]'
```

Only the server owner configures these endpoints. A successful HTTP response establishes endpoint reachability, not comprehensive service health. No commands are executed.

## Verify and back up

Confirm real resources match each provider, exercise actions on a test guest/container/dataset, and inspect task outcomes. Disconnect a provider and verify its error is shown. Restart the stack and verify users, settings, alert rules and history persist.

Back up the PostgreSQL volume, host `runtime/`, Caddy data, `.env` and connector certificates. Test restoration separately. The application uses `runtime/live-state.json`; legacy `state.json` demo records are deliberately not imported. No live infrastructure was tested by the local source checks.

### Updates from the dashboard

For an existing Ubuntu installation, run `sudo homecloud update` once, then run the following to enable the new update service (the previous CLI version may not install it automatically):

```bash
cd /opt/homecloud-hub
sudo bash deployment/setup-updater.sh
```

New installations enable it automatically. Sign in as the owner. The header Update button replaces Sign out. An orange dot appears when the one-minute GitHub check finds a newer commit on the installed branch. Click Update to pull, rebuild and restart the deployment; the dashboard reconnects and reloads after completion. Database volumes, configuration and saved connections are retained. Other roles cannot trigger updates. Pinned releases require a manual update; local tracked changes block updates. Failures appear in the dashboard; inspect `sudo journalctl -u homecloud-updater -n 100` for details. No Docker socket is exposed to the API.


### Automatic discovery and overview

The Nodes tab supports search, status and membership filters, sorting, list/grid views and per-node details. Node CPU, memory and storage charts use collected readings, with gaps for unknown values. Proxmox cluster members are peers; the app does not infer master/worker roles. The common uptime displayed is the shortest uptime of all online members, not a claim about historical cluster availability.

Node reboot and shutdown require the application's admin/owner role, typed confirmation and Proxmox Sys.PowerMgmt permissions. Service operations require Sys.Modify; system logs require Sys.Syslog. Node configuration is read through the API; editing and shell access open the Proxmox console. Add Node guides the user through Proxmox's authenticated cluster join workflow, then refreshes discovery. The app never changes cluster membership implicitly.

The Proxmox page has a compact cluster overview, live node charts, quorum and service readings, recent tasks and storage usage. Its time selector filters the recorded node history and provider tasks. Storage totals are sums of per-node entries; shared pools can appear more than once. No Ceph, HA or security health is inferred from node connectivity.

Create VM allocates an empty virtual machine. Create CT requires an existing OS template volume and creates a stopped, unprivileged container with DHCP; supply a public SSH key for access. Creation requires the appropriate Proxmox allocation and storage permissions in addition to the application's operator role. Task IDs and logs report provider outcomes. Shell Access opens the Proxmox web console and requires a separate Proxmox login. Cluster Backup opens the real backup jobs and schedules rather than starting an implicit cluster-wide backup.

Saving a Proxmox cluster starts automatic discovery of its nodes, VMs, LXC containers, storage and node services. No separate HomeCloud agent, enrollment key or per-guest HomeCloud installer is used.

Running VMs with an existing QEMU guest agent can report services, installed packages and Docker containers through Proxmox. HomeCloud executes only fixed read-only inventory commands inside those guests and caches inventory for five minutes. Linux systemd/Debian package inventory and Windows service/installed-program inventory are supported. A missing guest agent or denied API permission is shown as an access limitation; inventory is not guessed from VM names. LXC internal applications and appliances still require access beyond the ordinary Proxmox resource API; their lifecycle, storage and resource measurements remain available.

For node status/services HTTP 403, in Proxmox open Datacenter → Permissions. Assign PVEAuditor at path `/`, with Propagate enabled, to both the backing user and privilege-separated API token. Guest inventory execution additionally requires `VM.GuestAgent.Unrestricted` on Proxmox 9 (older versions use their guest-agent execution privilege). Grant only on guests that HomeCloud should inspect. This is a powerful Proxmox permission; HomeCloud uses it for its fixed inventory commands. Node service management needs `Sys.Modify`; VM lifecycle actions need the corresponding VM management privileges.

The overview uses compact live cards. Node selection filters resources and guests; the time selector filters collected CPU/memory history. Add Widget saves visible widgets in the browser. Refresh requests a fresh measurement; Export downloads the current report. Create VM and Run Backup open their actual action forms. AI Health Check reads the current live status. The infrastructure map shows observed node/guest relationships. API reachability is a measured percentage, not a fabricated security score. Backup counts are provider-reported archives and jobs; Monitoring shows task outcomes.

For updates, use the header Update button or `sudo homecloud update`. GitHub checks run every minute. If the updater is missing, run `cd /opt/homecloud-hub && sudo bash deployment/setup-updater.sh` once.

## Notifications and provider checks

External delivery is optional. Configure channel values listed in `.env.example` in the server `.env` and apply them with `sudo homecloud restart`. Do not commit webhook URLs, bot tokens or SMTP passwords. Owner-only Settings shows delivery status and has a test action. These features do not configure an external channel or recipient automatically.

Delivery state is persisted in `runtime/live-state.json`. Pending deliveries retry during monitoring samples, independently of API response completion. Keep the runtime directory in deployment backups. The queue keeps a maximum of 1,000 pending messages and processes up to 20 per flush. At-least-once retries may duplicate messages after ambiguous network failures.

Provider diagnostics are read-only and owner-only. Run them after updating the VM and record failures by provider and method. Verify writes only against disposable staging guests/datasets using the installed API version and its required privileges. No live share or media changes are part of these checks.
