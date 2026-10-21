# Commercial acceptance and remaining launch gates

Developer: The Adekola · Company: ATT-Tech. Updated 21 October 2026.

Publication and new release notes remain paused. The current design supports a dedicated controller per customer. It is not a shared multi-tenant SaaS service. These procedures collect evidence; they do not create a compliance, uptime or security certification.

## Evidence and approval

Copy [acceptance-record.example.json](acceptance-record.example.json) to a restricted location outside the checkout. Record the actual installed version and 40-character source revision, exact provider versions, measured capacity and reviewers. Each check needs its own date, tested revision and private evidence references. Record negotiated support/security contacts, maintenance window, retention, key custodian and RPO/RTO; do not invent commitments. Never commit customer records, raw logs, credentials or backup contents.

Run:

```sh
node deployment/acceptance-gate.mjs /private/path/acceptance.json
```

Exit status zero means the record is complete and explicitly approved by its reviewer. Missing, failed, future-dated, different-revision or unapproved records fail. It does not authenticate evidence or contact a live installation. A reviewer must inspect the underlying evidence. Retest affected checks after changes; the checker deliberately requires the deployed revision for every gate. Do not change status to passed based only on CI.

## Provider and recovery acceptance

Perform these on an authorized staging installation with disposable resources. Confirm every destructive operation at action time. Keep original data, existing backups and encryption keys intact.

| Gate | Procedure and required result |
| --- | --- |
| Identity/access | Record controller and connector revisions. Verify trusted HTTPS, owner MFA enrollment and recovery, password change, logout/device revocation, denied roles and least-privilege provider failures. |
| Proxmox/Docker/TrueNAS | Record exact versions and enabled operations. Create disposable resources, exercise supported lifecycle/storage operations, inspect provider task outcomes and data, then clean up only the resources created for the test. A connection test is insufficient. |
| Fresh backups | Run the intended job separately for every in-scope node. Record successful provider task IDs, destination capacity, retention and exclusions. Check archive identity/time and ensure independent off-host copies where required. |
| Guest restore | Restore a fresh archive into an unused isolated guest ID, with conflicting production network access prevented. Boot it, verify representative files and application/database behavior, and record results. Preserve the original guest and archive. |
| Controller recovery | Follow the encrypted recovery guide on a separate isolated host. Verify MFA login, saved-secret decryption, audit/history and intended connector behavior. Record actual recovery duration and backup age against agreed RTO/RPO. Avoid connecting two controllers to the same privileged work. |
| Interrupted Docker update | On a disposable application, disconnect the browser/network and restart the controller during download, preparation, stop, rename and replacement. Confirm the same attempt remains visible, duplicate installation/recovery is rejected, and explicit recovery restores the original or verifies the installed replacement. Check mounts, data, aliases and policy. |
| Software rollback | In a disposable controller, test failed image startup and the actual supported schema upgrade/rollback path with known test accounts/state. Verify restored data/login. If file, database or service recovery fails, maintenance must remain enabled. Shell fixtures alone do not close this gate. |
| Notifications | Trigger a controlled failure and measured recovery. Verify actual delivery to every configured destination and acknowledgment/resolution counts. Do not send test messages without explicit action-time approval. |

CI additionally kills a disposable Docker worker at five phases and verifies exclusive recovery, original identity/running state, policy, network aliases and named-volume sentinel data. That uses real local Docker resources but does not prove paired Proxmox execution, registry download, customer application migration or customer recovery behavior.

## Read-only performance probe

The probe issues GET requests only to nine fixed report routes, with bounded concurrency and timeouts. It refuses HTTP, credentials in URLs and redirects, and does not save tokens, host IDs or response bodies. It measures response headers rather than complete report-body validity, browser rendering or provider writes. HTTP errors, unexpected content types, timeouts and latency threshold violations fail. Provider inventories that report partial results in a 200 JSON body still require manual inspection.

On a trusted machine with Node.js 24, enter the actual controller HTTPS origin and an existing short-lived access token privately:

```bash
read -r -p 'Controller HTTPS origin: ' ICLUSTERS_PROBE_URL
read -r -s -p 'Short-lived access token: ' ICLUSTERS_ACCESS_TOKEN
printf '\n'
export ICLUSTERS_PROBE_URL ICLUSTERS_ACCESS_TOKEN
node deployment/probe-reports.mjs /private/path/report-probe.json
unset ICLUSTERS_ACCESS_TOKEN ICLUSTERS_PROBE_URL
```

Do not paste tokens into chat, shell command arguments, committed files or support tickets. Use a trusted CA; for a private CA supply `NODE_EXTRA_CA_CERTS` pointing to its public PEM file. Never disable TLS verification. The output filename must be new and is created with private permissions.

Defaults are three rounds, two concurrent reads, a 15-second timeout and a five-second per-route p95 limit. These are probe settings, not promised service levels. Optional environment variables: `ICLUSTERS_PROBE_ROUNDS` (1–100), `ICLUSTERS_PROBE_CONCURRENCY` (1–8), `ICLUSTERS_PROBE_P95_MS` (1–60000), and `ICLUSTERS_DOCKER_HOST` for one explicitly selected host. Repeat for each in-scope Docker host; the report records only whether selection was supplied. Authentication expiry fails the run; obtain a fresh token privately rather than extending a test by changing session security.

Use this short probe before and after a representative, agreed soak period. Record cold navigation, warm navigation, full report completeness, fleet size, container count, concurrent users, observation duration, host CPU/RAM, disk/database growth and provider timeout behavior. Host resource measurements require separate monitoring; this script cannot establish a capacity guarantee.

## Physical devices and independent security review

Test supported real iOS Safari, Android and desktop browsers. Cover login/MFA, navigation, per-section editing, switches, modals, keyboard/screen-reader use, text scaling, wake-lock denial, background/resume and interrupted installation. A wake lock is best effort; server jobs must remain recoverable when a phone sleeps.

Commission an authenticated independent security review of role boundaries, sessions/MFA, approval binding, SSH/TLS trust, privileged connectors, secret handling and browser exposure. Review all scan findings, including unfixed vulnerabilities, record remediation and have findings retested. This cannot be replaced by marking the security record passed or by a self-review of the source.

Agree the commercial offering and support process using [operations](operations.md), [security](../SECURITY.md), [privacy](../PRIVACY.md), [terms](../TERMS.md) and third-party notices. Obtain appropriate review for the actual service and jurisdiction. Keep shared-SaaS, universal compatibility and uptime/recovery guarantees outside the offering unless separately designed, measured and agreed.
