# API wiring and regression audit, 27 October 2026

Audited base: `daa6025bb91e48363ed41b9c75fddbbf1e383d84`.

## Result

No missing backend endpoint was confirmed for the reviewed frontend requests. The repository build passes. This is a source, fixture integration and isolated-controller audit; it is not verification of a customer's running installation.

The initial full run exposed obsolete Settings UI assertions after the requested Site Information lock and appearance simplification. It also exposed a test harness assumption that `apps/web/node_modules` always exists, even though workspace dependency hoisting can leave it absent. The suite now prepares that directory before creating bundled component fixtures.

Updated tests verify read-only Site Information for owners and viewers, no site-field change handler or automatic writes, refresh saves retaining current server metadata, refresh save failures and retry, absence of Security Status and removed appearance sections, six dropdown themes, theme background application, persistence failures preserving the previous selection, mode preservation, and an unsaved Sidebar draft surviving a theme change. Existing unrelated notification fixtures and tests are preserved.

## Scope and evidence

- 48 page source modules, their shared components, the request/authentication layer, and backend route registrations were reviewed with inventories and existing integration tests.
- 212 method/route registrations were inventoried, including account routes mounted under `/api/account`.
- An AST-assisted review expanded 310 candidate frontend request path/method variants. Conditional method/path cross-products were checked against their actual branches; generic wrappers were traced to their callers. These are candidate expressions, not 310 distinct endpoints or live requests.
- 756 JSX button templates across 107 files passed `node apps/web/scripts/audit-controls.mjs`. This detects static wiring omissions, not the correctness of every possible provider action.
- An isolated controller exercised 60 non-parameterized GET routes. 45 returned 200; 15 returned expected missing-provider or missing-input responses (400, 409 or 503). None returned an endpoint-not-found response or an unexplained server error. Authentication and database calls in this smoke harness used fixtures; no production credentials or providers were used.

| Area | Checks and result |
| --- | --- |
| Login, session and account | Setup, login/MFA, refresh rotation, session outages, logout, permissions and account routes covered by passing backend/frontend tests. |
| Dashboard and monitoring | Empty-provider reads, inventory summaries, measured values, host selection, partial failures and refresh behaviour covered. |
| Proxmox | Node, VM, CT, storage, network and task routes traced; fixture tests cover creation requirements, node-dependent media, actions, log paths and permissions. |
| Docker | Container, image, network, volume, compose, update and recovery paths traced; host pinning, read failures and confirmation flows covered. |
| Storage | Pool, disk, dataset, share and snapshot paths reviewed; selection consistency, browse, permissions, validation and provider errors covered. |
| Network | Topology, interfaces, devices, routing, DNS, firewall and traffic paths reviewed; node filtering and edit scope covered. |
| Backups | Job, schedule, destination, retention, preview, report and restore paths reviewed; confirmation and exact target selection covered. |
| Alerts and notifications | Alert/rule/history routes, channel setup, test delivery fixtures, acknowledgment, badge state and failed reads covered. |
| Shell and SFTP | Connection, fingerprint, grant, session, stream and file-operation paths reviewed; cancellation and session handling covered. |
| Settings and appearance | Current requested controls now have passing UI coverage, including failed saves and persistence. |
| AI, users and audit | Configuration, connection tests, model selection, access checks, user validation and audit reads covered. |
| Connectors and deployment | Python connector tests, migration, safe extraction, HTTPS configuration, updater, network and rollback fixtures passed. |

## Final checks

| Check | Result |
| --- | --- |
| `npm test` | 508 API tests and 571 web tests passed; zero failures, skips or cancellations. |
| `npm run build` | API build metadata and TypeScript/Vite production build passed. |
| Python test programs | 62 tests passed across seven connector/deployment programs. |
| Shell syntax | 18 shell scripts passed `bash -n`. |
| Release identity and local documentation links | `node deployment/check-release.mjs` passed. |
| Deployment fixtures | `test-network.sh`, `test-updater.sh` and `test-upgrade.sh` passed. |
| Diff whitespace | `git diff --check` passed. |

## Remaining installation verification

The user's private installation was not reachable in this audit environment. Actual provider permissions, current provider versions, paired connector connectivity, real notification delivery, SSH/SFTP access, writes on disposable guests, restore boot/data checks, browser rendering and device-specific behaviour remain unverified here. Passing fixture tests cannot establish those outcomes. Use `docs/acceptance-checklist.md` and the private acceptance record for installation evidence.

No infrastructure mutation, notification to an external recipient, live backup or restore was performed by this audit.
