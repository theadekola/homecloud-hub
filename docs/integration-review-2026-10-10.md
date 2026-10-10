# HomeCloud Hub integration review, 10 October 2026

Reviewed repository baseline: `9842bb9` on `main`, after the shares commit `70abd67`. Remote main was fetched and remained at that baseline. Changes are local, not published or deployed. The combined patch includes the previously prepared NFS validation fix. No production credentials, live exports, media shares or infrastructure actions were used.

This is a source-level integration review plus local automated verification. It does not certify every screen or establish compatibility with a live Proxmox, TrueNAS, OPNsense or Tailscale installation. Browser-client tests use mocked browser globals; there was no full browser click-through. Container deployment was not run.

## Confirmed problems corrected

| Area | Failure before | Correction |
| --- | --- | --- |
| NFS validation | A slash was sufficient for malformed networks such as `not-an-ip/999` | Parse IPv4/IPv6 and enforce numeric prefix ranges; reject scoped addresses, whitespace and sparse arrays. Existing directory restrictions remain. |
| Docker confirmations and audit identity | Confirmation phrases were not consistently tied to the selected host. The generic action route checked the route template rather than its actual provider. | All Docker action resources include the selected host, or `direct-engine`, in the confirmation and audit identity. A phrase from another host is rejected. |
| Docker client retry | The confirmation retry reread a changed host selection | Preserve the original selection for the confirmed retry, including an explicitly selected direct Engine. |
| Global monitoring | A request-triggered sample could inherit an agent host and cache that host as the global Docker provider | Run shared sampling with an empty agent context; selected-host reads and actions retain their request context. |
| Session recovery | Refresh failures cleared tokens even during temporary outages; startup failures also cleared the session | Only rejected authentication clears tokens. Temporary failures retain them and startup offers Retry connection. |
| API headers | Spreading a Headers instance dropped its entries | Normalize supported RequestInit headers before adding authentication and selected-host headers. |
| Polling | Overlapping reads and late responses after endpoint changes could update the wrong screen | Allow one pending hook read, cancel on cleanup and ignore obsolete responses. Slow reads are not cancelled by each timer tick. |
| Backups | Job and archive reads failed together; absent Proxmox broke the page | Return connector status and independent error information; successful job inventory survives archive failure. |
| Password handling | Login trimmed passwords while creation hashed exact passwords | Compare the exact submitted password. |
| User creation | Email/name validation discarded its normalized return value | Store trimmed names and trimmed, lowercase emails. Existing malformed accounts are not migrated automatically. |
| Docker discovery display | Read-only guest-discovered containers existed in the response but the UI hid the table without an Engine host | Display that inventory and its limitations with management controls disabled. |
| Local development | Web requests used the Vite origin with no API proxy | Add a Vite `/api` proxy to the local API; a real local HTTP fixture verifies forwarding. Production Caddy routing remains unchanged. |
| Regression coverage | Web client had no test script or CI test step | Add browser-client and development-proxy tests; root tests and CI run them. |

## Verification

- Node v24.19.0 in this environment. Production/CI specify Node 20; Node 20 and container execution were not available for independent verification here.
- `npm test`: 72 API tests and 8 web tests passed, zero failures or skips.
- `npm run build`: API script, TypeScript and Vite production build passed. The JavaScript bundle remains roughly 1.04 MB before compression and triggers the large-chunk warning.
- Against unpatched code: all 6 added API integration tests fail; 4 of the 7 browser-client tests fail. The prior NFS regression checks also fail on the original implementation.
- `bash deployment/test-updater.sh`: passed availability, update and failure-handling fixtures.
- Shell syntax checks passed for the installer, CLI, updater, updater setup, network helper and secret generator. Installer `--help` passed.
- Python node-agent compilation passed.
- Network fixture cases passed for route selection, interface fallback and missing-address rejection. The original full network test exits before those fixtures because this runner exposes no usable global IPv4 address.
- `git diff --check`: passed.
- No Docker executable: Compose configuration, image build/start, PostgreSQL migration and registration smoke checks remain unrun here.

## Remaining work, ranked

| Priority | Work | Evidence and next step |
| --- | --- | --- |
| High | Validate real provider compatibility on a staging HomeCloud VM | Fixtures verify contracts, not installed releases or token permissions. Start with restricted discovery. Check actual node/guest/storage inventory and TrueNAS query/stat/service methods. Only test writes against disposable guests and datasets. |
| High | Bring all paired Docker hosts into global monitoring | Global monitoring currently samples the direct Engine. Dashboard discovery relies on the direct Engine and Proxmox guest inventory. Paired agent host inventory is principally consumed by the Docker page. Build a separate per-host sampler with host-qualified container identities, history and alert keys. Do not reuse one selected host as global state. |
| Medium | Align Storage and Network Docker inventories with the host selector | `/storage` and `/network` use the global direct-Engine snapshot, while Docker tabs use the selected agent host. This is not a broken route, but the views can legitimately show different inventories. Decide whether to show a host selector or clearly label the direct provider, then add per-host inventory without changing TrueNAS/Proxmox semantics. |
| Medium | Test the node agent under slow and larger inventories | The bridge has one job worker and bounded responses; guest execution, long pulls and queued parallel reads may hit timeouts or limits. Exercise multiple guests, offline nodes, reconnects and larger logs on staging. Installed agent scripts require their own update. |
| Medium | Add full browser workflow tests | Client regression tests do not mount React screens. Cover login outage/retry, polling cleanup, read-only Docker discovery, role-based controls, host selection, forms, confirmation cancellation and navigation. |
| Medium | Add external notifications | Alerts currently exist in-app. Discord, Telegram or email delivery needs configuration, retry/deduplication and secret handling. Acknowledgment must remain separate from resolution. |
| Medium | Plan authentication improvements | Two-factor login is not implemented. Client sign-out removes browser tokens; there is no server logout/revocation endpoint. Add explicit refresh-token revocation and choose a 2FA approach before adding controls to the UI. |
| Medium | Reduce frontend payload and review dependencies | The build reports a large bundle and dependency installation reports the Recharts 2 branch as deprecated. Consider route-level lazy loading and a separately tested dependency upgrade. No dependency version changes are included. |
| Low | Extend current product boundaries deliberately | Compose-file deployment, generic volume/database backup execution, network discovery and firewall-rule editing are documented as absent. They require new features and provider validation, not simply connecting existing buttons. |
| Low | Complete integration documentation | The README now lists share management and the development proxy. Expand a version-specific compatibility matrix after live staging validation, rather than claiming compatibility from unit tests. |

## Applying the combined patch

From an unmodified checkout at baseline `9842bb9`:

```sh
git apply --check /path/to/homecloud-integration-fixes.patch
git apply /path/to/homecloud-integration-fixes.patch
npm ci --prefix apps/api --workspaces=false
npm ci --prefix apps/web --workspaces=false
npm test
npm run build
```

If the earlier standalone NFS patch is already applied, reverse that patch first or apply the other changes selectively: this combined patch already contains it. Review and commit the changes before using the production updater; the updater intentionally rejects local tracked edits. Deployment and live-write verification require a separate staging step.

## Follow-up implementation

The remaining Docker monitoring, selected-host resource views and external notification features have now been implemented in the repository. Monitoring includes isolated paired-host reads, host-qualified metrics and alerts, Engine deduplication, offline node reporting and a Docker monitoring table/history view. Storage and Network share the Docker selection without substituting an offline host. Settings exposes optional Discord, Telegram and verified-TLS SMTP delivery, retry status and owner-only test actions.

Settings also provides owner-only read-only API diagnostics for all configured providers. This addresses missing diagnostic tooling; actual compatibility with the user's installed releases and write permissions still requires running those checks and disposable staging write tests after deployment. Notification credentials and destinations must be configured by the owner. No live notifications or infrastructure writes were performed during implementation.
