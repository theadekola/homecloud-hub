# Settings

Settings uses one primary location for each group of controls. Related tabs link to that location rather than repeating its form, credentials or action panel.

| Tab | Primary responsibility |
| --- | --- |
| General | Instance name/description, regional display facts, shared page refresh, dashboard widgets and measurement conventions |
| System | Runtime metadata, deployment facts, resource limits, maintenance, general-settings Backup & Restore and owner-only provider compatibility checks |
| Security | Authentication/access policy, current browser session, audit preview and audit download |
| Connections | Provider credentials, pairing, health and verification; Notifications workspace for delivery configuration and history |
| Appearance | Theme, accent, sidebar, density, fonts, backgrounds, radius and motion preferences |
| About | Product description, version/update controls, credits, licensing, project resources, legal information and developer details |

## Editing and persistence

Editable input sections have independent edit and save icons. Saving one section does not submit another section’s draft. Failed saves retain the section draft and show an error. Navigation discards unsaved section inputs. Switches apply immediately, including dashboard widgets, appearance motion and notification preferences; failed persistence keeps the previous saved value. Theme, density and background choices also apply immediately. There are no page-wide Edit, Save or Cancel controls. General-settings imports remain staged for review in System before using that section’s save icon.

Site name, description and the 15–300 second page-refresh preference require administrator or owner access and are shared. Dashboard widget preferences are saved in this browser and are editable by signed-in viewers. General saves do not rewrite appearance or sidebar preferences.

Appearance saves only this browser's preferences and never PUTs shared settings. Light, Dark and System themes are supported; System tracks the device's colour preference while HomeCloud is open. Other options include validated hex accents, solid/gradient accents, intensity, sidebar expansion, section labels, density, supported font families, bounded corner radius, solid/gradient backgrounds and reduced motion. The mobile hamburger is enforced. Terminals retain their own dark palette. Sidebar repositioning and image backgrounds remain unavailable.

## Runtime and maintenance

System displays actual API/container runtime facts rather than physical-host uptime claims. Its browser maintenance actions clear only in-memory API reads, refresh metadata or reload the interface. Reload asks for confirmation because terminals may disconnect. Host reboot, stop-all, factory reset and arbitrary service management are not exposed.

Runtime metadata is not repeated under About. About owns version/update information, while System owns hostname, OS, kernel, architecture, Node.js runtime, uptime and datastore facts. The global header updater remains an application-wide shortcut.

Provider inventory and per-provider health are owned by Connections. System runs explicit read-only API compatibility checks and can export their results. The checks do not create guests, change shares or prove write permissions. Only owners can run them. Failures remain visible and retryable.

## Security

Security displays enforced policies without presenting deployment-managed protections as editable switches. It shows role policy, token lifetimes, password requirements, current transport observations and the available current-browser session. It includes optional authenticator MFA, recovery codes, password change and the current user’s revocable device-session inventory. Intrusion detection is not provided.

Sign Out This Browser appears once, under Active Sessions. It revokes this device’s server session and removes its browser credentials. Legacy sessions without a device identity revoke all sessions. The account controls also support explicit all-device revocation. Audit preview/download is available only to roles allowed to read /audit. Preview loads on request; download uses the API's retained-record limit. General and System do not duplicate these session or audit controls.

## Delivery and integrations

Connections → Notifications is the single delivery-management workspace. Owners can open secure configuration forms for all nine supported notification channels, set channel/master switches and severity/recovery preferences, send explicit tests, and inspect delivery history. Failed preference writes restore previous values. Unconfigured channels cannot be enabled.

All-channel tests and individual-channel tests have distinct scopes. Test actions ask before sending real messages. The embedded delivery history includes filters, paging and details without a second channel-configuration panel, dashboard or test runner. It does not send messages on open or refresh.

Integrations and Advanced are removed from Settings navigation. Old links redirect to Connections and System respectively.


## Backup and product information

General-settings exports contain site name, description and refresh interval. Imports validate and stage only those fields for review before saving that section. Credentials, user accounts, application data, browser preferences and infrastructure backups are excluded. Export/import lives under System → Backup & Restore. The separate settings tab is removed; its old links redirect to System.

About uses reported version facts and verified project links. Build number, UTC date and source revision come from build-time API metadata; development builds without metadata are labelled explicitly. About links to the MIT License, security guidance, privacy/data handling and terms of use, plus the full README and architecture diagrams. Shared instance-name/description inputs stay in General. Project documentation and issue links are consolidated into Quick Links rather than repeated in a Support card.

All tabs retain responsive layouts, search where applicable and the existing permission checks. Removing duplicate sections does not add new provider capabilities or change live infrastructure.

AI configuration lives under Connections, with the same owner-only popup linked from Assistant. Proxmox storage registration uses one shared form across storage and backup destinations. Backup and snapshot schedule shortcuts open the canonical Schedules editor.
