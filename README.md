# HomeCloud

**Your infrastructure, in one interface.**

HomeCloud is a self-hosted infrastructure management application for Proxmox VE, Docker and TrueNAS. It brings inventory, monitoring, supported infrastructure actions, backups, SSH terminals and SFTP into one responsive interface.

Developed by **Adekola Kazeem Ayannuga** through [The Adekola Labs](https://theadekola.online). Application version: **3.0.0**. Licence: [MIT](LICENSE).

## Contents

- [Features and scope](#features-and-scope)
- [Architecture](#architecture)
- [Install on Ubuntu](#install-on-ubuntu)
- [First sign-in](#first-sign-in)
- [Connect your infrastructure](#connect-your-infrastructure)
- [Monitoring and notifications](#monitoring-and-notifications)
- [Updates and build information](#updates-and-build-information)
- [Backup and recovery](#backup-and-recovery)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Documentation and project policies](#documentation-and-project-policies)

## Features and scope

| Area | Implemented functionality |
| --- | --- |
| Overview | Observed infrastructure health, node/guest inventory, resource history, configurable dashboard widgets and report export |
| Proxmox VE | Nodes, VM/LXC inventory, create-VM configuration, lifecycle actions, snapshots, storage, network and provider task inspection |
| Docker | Paired host discovery or optional direct Engine API; container inventory, metrics, logs and lifecycle; image inspection/pull/build; networks, volumes and supported cleanup |
| Existing Compose projects | Discover and start, stop or restart their existing containers; Compose file deployment is not provided |
| Storage and network | Proxmox, selected Docker host and configured TrueNAS views; supported Proxmox network/firewall actions, with provider permissions |
| TrueNAS | Pools, disks, datasets, snapshots, jobs, periodic snapshot tasks and SMB/NFS share management; API compatibility depends on installed TrueNAS version |
| Backups | Proxmox jobs/archives, backup schedules, retention preview/prune and restore into unused guest IDs; TrueNAS snapshot workflows |
| Monitoring | Collected measurements, connection health, measured alert rules, unresolved alerts, recovery history and provider task outcomes |
| Notifications | Header activity feed, persistent unresolved-alert badge and configured Discord, Telegram or SMTP delivery |
| Tools | Administrator SSH shell with multiple tabs, copy/paste and SFTP file operations, using target authentication and verified host identity |
| AI Assistant | Owner-configured OpenAI Responses or Chat Completions, model discovery and connection testing; read-only assistance |
| Administration | Accounts/roles, audit records, encrypted supported integration configuration, browser appearance and session preferences |

Missing or inaccessible information is shown as unavailable or partial. It is not replaced with demo data. A queued action is not proof of provider completion. App two-factor authentication, a security scanner, arbitrary workflow automation, generic Docker-volume/database backup execution and Compose file deployment are not implemented. OPNsense and Tailscale integrations are not included.

## Architecture

```mermaid
flowchart TB
    Browser["Browser: desktop, tablet or phone"] --> Gateway["Caddy: HTTPS and proxy"]
    Gateway --> Web["React application"]
    Gateway --> API["Node.js / Express API"]
    API --> DB["PostgreSQL: accounts and audit"]
    API --> State["Runtime files: configuration and monitoring"]
```

```mermaid
flowchart TB
    API["HomeCloud API"] --> PVE["Proxmox VE API"]
    API --> Agents["Paired node or Docker host connectors"]
    API --> Engine["Optional direct Docker Engine"]
    API --> NAS["TrueNAS API"]
    Agents --> Docker["Local or guest Docker socket"]
```

Paired connectors poll HomeCloud over outbound HTTPS; the arrows show logical access, not inbound listener requirements. Optional external notification services and OpenAI receive requests only for their configured features. See [architecture and repository structure](docs/architecture.md) for trust boundaries, data flows and source layout.

## Install on Ubuntu

Use a dedicated Ubuntu server or VM with systemd, Git/network access and capacity for Docker, the API and PostgreSQL. This does not install HomeCloud into the Proxmox host itself. Existing Docker installations need the Compose plugin.

```sh
sudo apt-get update
sudo apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/theadekola/homecloud-hub/main/install.sh -o /tmp/homecloud-install.sh
less /tmp/homecloud-install.sh
sudo bash /tmp/homecloud-install.sh
```

The installer creates `/opt/homecloud-hub`, generates deployment secrets, installs Docker if absent and starts the service at boot. It detects the VM address and prints **https://VM-IP:6002**. Port **6003** is the auxiliary HTTP port. API port 6000 is internal to Docker and must not be used as the browser URL. Existing public-domain deployments retain their selected configuration.

LAN HTTPS uses Caddy's local certificate authority. Install its public root certificate in your browsers and paired nodes' trust stores. Do not disable certificate verification. For public-domain HTTPS, port overrides, pinned refs and manual installation, follow [PRODUCTION.md](PRODUCTION.md).

## First sign-in

1. Open the HTTPS address printed by the installer.
2. Enter your name, email, password and the first-use setup code to register the owner account. Registration closes after the first account is created.
3. Sign in. Administrators create subsequent users from **Users**.
4. Use the eye icon to show or hide the entered password. **Remember me** controls persistent browser sign-in; it does not save the password.
5. Choose an inactivity timeout under **Settings → Security → Active Sessions**. The default is 30 minutes, including remembered sign-ins. See [browser sessions](docs/browser-sessions.md).

If you missed the first-use code, run this on the HomeCloud VM and copy only the value after `=`:

```sh
sudo grep '^SETUP_TOKEN=' /opt/homecloud-hub/.env
```

Keep the code and signing keys private. They are deployment bootstrap secrets. Supported provider credentials are entered through the application's configuration forms, without manual environment-file edits.

## Connect your infrastructure

Open **Settings → Connections → Add Connection**.

| Connection | Setup |
| --- | --- |
| Proxmox Node | Enter cluster endpoint/token/TLS settings, test and save, then pair the node using the displayed instructions. One active Proxmox cluster is supported. |
| Docker Host | Create a short-lived pairing command and run it on the Linux Docker host. Verify the discovered Engine before opening Docker. |
| Advanced: Direct Docker API | Use an existing authenticated HTTPS Docker endpoint with the required CA/client certificates. This is optional for paired hosts. |
| TrueNAS | Use its configuration popup to save the HTTPS origin, API key, supported protocol and trusted CA as required. |

For Proxmox pairing, install one connector per node. Linux CT access uses `pct exec`; Linux VM access uses `qm guest exec`. VMs need the QEMU Guest Agent enabled in Proxmox and installed/running inside the VM. Guests need `/bin/sh`, `curl`, `base64` and the local Docker socket. Windows guests are not provisioned by this Linux Docker setup flow.

**Connect** verifies an existing Engine. **Install & Connect** supports eligible Debian/Ubuntu guests, reuses existing Docker installations, and asks for explicit approval and target credentials. A CT configuration change may require a restart; HomeCloud does not restart guests automatically for setup. Use verified SSH bootstrap where the UI offers it for missing guest access.

Use dedicated provider identities with only the privileges needed. Proxmox guest command execution needs a separate scoped privilege, not just the read role. See [connection recovery](docs/connections-and-health.md) and [warning recovery](docs/monitoring-warning-recovery.md).

Connector **version 5** batches container statistics. After updating HomeCloud, use the connector update command shown in Guest Setup on each paired Proxmox node. It preserves pairing credentials. No per-guest Docker TCP port or per-guest HomeCloud agent is required. Docker, Storage and Network share the selected Docker host; Proxmox and TrueNAS resources remain independent.

## Monitoring and notifications

Provider monitoring normally samples every 30 seconds; read caches and UI polling can have different intervals. Gaps, permission failures and partial readings are retained as limitations. Missing metric samples do not resolve metric alerts.

The header bell counts **unresolved alerts only**, including acknowledged conditions that have not recovered. Recent activity stays in the popup without increasing the badge. Marking activity read does not resolve alerts.

Configure Discord, Telegram or SMTP in **Settings → Notifications**, save, enable the channel and send an explicitly confirmed test. Saved credentials do not prove delivery. Failed deliveries retry with backoff; delivery is not guaranteed exactly once.

AI configuration is under **Settings → Integrations** and on the Assistant page. You can load models and test an unsaved API-key/model/API-type draft before saving. AI tests and use can incur provider charges. Assistant requests send user text and selected infrastructure measurements to OpenAI; the assistant cannot execute infrastructure actions.

## Updates and build information

Owners can check/install updates with the header Update control. An up-to-date check displays a temporary message. From the Ubuntu VM:

```sh
sudo homecloud update
sudo homecloud status
```

For older installations without the updater, after updating run:

```sh
cd /opt/homecloud-hub
sudo bash deployment/setup-updater.sh
```

The updater checks the configured Git upstream and rebuilds the deployment. Local tracked changes block updates; pinned releases require a deliberate ref change. Database volumes and saved configuration are retained. Keep backups before upgrading.

**Settings → About → Version Information** reports the application version, build number, UTC build date and embedded source revision. Standard install/update commands supply Git revision and build time automatically. A plain Docker build still embeds a real build timestamp and number, but may have no revision. Restarting the container does not change these values. Development runs without generated metadata are labelled accordingly. See [build information](docs/build-information.md).

## Backup and recovery

HomeCloud manages provider-reported backup/snapshot operations; it does not turn every Docker volume or database into an independently protected backup. A ZFS snapshot on the same pool is not an off-host backup.

Protect the controller separately: back up PostgreSQL consistently, its `runtime` directory, deployment configuration and signing/encryption keys, certificates and Caddy data as applicable. Encrypted saved credentials require the original key material. Keep backups outside the controller and test restores. Do not run `docker compose down --volumes` on a live installation unless you intend to delete its volumes. See [production recovery](PRODUCTION.md).

## Development

Use Node.js 20 or a compatible installed runtime and a PostgreSQL instance. The API needs database configuration and signing keys; review `.env.example` and [production configuration](PRODUCTION.md). Run API tests against their fixtures rather than live infrastructure.

```sh
npm install
npm test
npm run build
npm run dev
```

The Vite server proxies `/api` to `http://127.0.0.1:6000`; use `HOMECLOUD_DEV_API_URL` if the development API has another address. Production uses Caddy. `npm run build` generates API build metadata and compiles the web application. Connector Python checks can be run with `python3 apps/api/test/node-agent-python.test.py`.

If Windows workspace links are unavailable, install separately within `apps/api` and `apps/web` using `npm install --workspaces=false`, then run the root build. TLS tests require OpenSSL. Automated tests validate isolated protocols and UI behaviour; compatibility with real provider versions and permissions must also be checked on the deployment.

## Troubleshooting

| Symptom | Next check |
| --- | --- |
| VM discovery HTTP 403 | Check user and privilege-separated token ACLs. Scope `VM.GuestAgent.Unrestricted` to intended VM paths for Proxmox 9 guest commands; retain the read role. |
| Guest agent unavailable | Enable the VM option and install/start the guest OS service. A full shutdown/start may be necessary after adding its channel. |
| Container statistics unavailable | Update HomeCloud first, then paired connectors to version 5. Inspect actual container state and the precise reported error. |
| Docker inventory unavailable/offline | Verify selected host, connector service, network, guest power and Docker service. No substitute host is selected silently. |
| Browser certificate warning | Trust the deployment CA or use a valid publicly trusted hostname/certificate. |
| Integration test fails | Check the popup's endpoint, credentials, CA, permissions and service-specific error. Save and test have different effects. |
| Update fails | Inspect updater status and `sudo journalctl -u homecloud-updater -n 100`. Check tracked changes and upstream availability. |

```sh
sudo homecloud status
sudo homecloud logs
# On a paired Proxmox node:
journalctl -u homecloud-node-agent.service -n 100 --no-pager
```

Do not post credentials, environment files, private SSH material or full unredacted infrastructure reports in public issues.

## Documentation and project policies

| Document | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Structure diagrams, component responsibilities and repository layout |
| [Production](PRODUCTION.md) | Installation, HTTPS, deployment configuration and recovery |
| [Runtime configuration](docs/runtime-configuration.md) | Supported configuration popups and secret handling |
| [Connections](docs/connections-and-health.md) | Pairing, verification and connection health |
| [Warning recovery](docs/monitoring-warning-recovery.md) | Permissions, guest agents and Docker diagnostics |
| [Settings](docs/settings-overview.md) | Settings scope and available controls |
| [Header notifications](docs/header-notifications.md) | Activity, unresolved alerts and read markers |
| [Security](SECURITY.md) | Implemented controls, reporting and operational boundaries |
| [Privacy](PRIVACY.md) | Stored information, external requests and deployment responsibilities |
| [Terms of use](TERMS.md) | Self-hosted usage and responsibility boundaries |
| [Licence](LICENSE) | MIT application licence |
| [Icon assets](docs/icon-assets.md) | Third-party artwork sources and separate licences |

Use [GitHub Issues](https://github.com/theadekola/homecloud-hub/issues) for reproducible bugs and feature requests. For vulnerabilities, follow [SECURITY.md](SECURITY.md) and avoid public disclosure of exploitable details.
