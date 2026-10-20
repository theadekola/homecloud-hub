> Historical baseline review. Several findings were corrected later. See [current release-candidate assessment](2026-10-20-release-candidate.md) for current status.

# i-Clusters commercial readiness review

Review date: 20 October 2026. Source baseline: `e89e916` on `main`, plus the corrections in this review. This is a source and automated-check assessment, not a penetration-test certificate, service availability measurement or live provider acceptance test.

## Decision

**Not ready for an unrestricted commercial production launch.** A controlled paid pilot is a reasonable next step only after its installation-specific security, recovery and provider checks pass. Use one dedicated controller per customer, private access and an agreed limited scope. There is no evidence here to approve a public shared SaaS service, customer isolation on one controller, mission-critical workloads or contractual uptime/recovery guarantees.

The product has substantial implemented functionality and regression coverage. Passing tests is evidence for the tested behavior; it does not prove that arbitrary customer infrastructure is compatible or recoverable.

## Verified strengths

- Server-side authentication, account status/role rechecks, password hashing, refresh rotation/replay rejection, first-owner registration locking, role-gated endpoints and scoped sensitive-action approvals are implemented.
- Saved supported provider secrets are encrypted, reads mask secrets, SSH identity is pinned, TLS verification is supported, and the standard Compose stack publishes neither PostgreSQL nor the API directly.
- Real provider failures and incomplete backup inventories are represented as partial/unknown rather than fabricated successful readings.
- Docker update code preserves reviewed configuration and mounts, checks replacement startup/health and attempts verified restoration on caught failures. Backup restores validate unused guest IDs and source/destination availability.
- The existing CI builds/starts an isolated Compose deployment and tests registration through HTTPS against real PostgreSQL. Most provider tests use fixtures.
- MIT application licensing, separate artwork notices, security/privacy/terms documents and source/build identity are present. Licence permissions do not supply commercial support or operational assurances.

## Corrections in this review

| Finding | Correction and verification |
| --- | --- |
| Unsupported account role values could be interpreted through inherited object properties in permission checks. | Restrict the role map to frozen, explicit entries without inherited properties. A regression reproduced the previous authorization failure and now verifies rejected stored/granted unsupported roles before database work. Existing role and token tests remain in place. |
| Production API/web build images and CI selected Node.js 20, which ended support on 30 April 2026. | Change them to Node.js 24 LTS; update development guidance. The local checks run on Node.js 24.19.0; the PR CI also exercises the Node 24 container deployment. |
| Privacy documentation incorrectly said inactivity applies to remembered sessions; README said acknowledged alerts counted in the bell. | Correct both statements to match implementation. Include username and optional email in the data inventory. |
| Compose smoke test still exercised only email-based sign-in. | Exercise username registration/sign-in, the fixed ten-day remembered deadline, refresh preserving that deadline, replay rejection and the existing email compatibility alias. |

## Remaining release gates

These are readiness requirements for the proposed scope, not claims that every row is an exploitable defect.

| Priority | Evidence and limitation | Acceptance requirement |
| --- | --- | --- |
| High: privileged identity and recovery | `security.js`, `app.js`, `session.ts`, `Layout.tsx`: no implemented MFA, server logout/session revocation, password-change/reset workflow or account recovery flow. Sign-out clears browser tokens. Account deactivation is checked, but is not a substitute for revoking a particular session; owners cannot be deactivated through the current account toggle. | Before customer production use, implement/test account recovery and credential rotation plus revocable sessions. Require MFA through an enforced gateway for any interim pilot, with no direct bypass to the controller; plan application MFA/SSO for general release. Preserve the requested fixed remembered-session lifetime while making revocation effective. |
| High: browser token exposure | `session.ts` stores tokens in JavaScript-readable local/session storage, including persistent remembered sign-ins. No demonstrated XSS is claimed. Helmet protects API responses, but `deployment/Caddyfile` and `apps/web/nginx.conf` do not set an explicit CSP for the served frontend. | Evaluate secure HttpOnly refresh/session cookies with CSRF protections; deploy/test a frontend CSP, and complete independent authenticated security testing before broad exposure. Do not present rate limiting or CORS as substitutes. |
| High: controller disaster recovery | `PRODUCTION.md` describes the items to back up but provides no complete executed controller backup/restore runbook or restore drill evidence. The general-settings export omits accounts, credentials and application state. | Produce a consistent PostgreSQL/runtime/key/certificate backup with restricted off-host retention. Restore on a clean isolated controller, decrypt saved configuration, test login and verify history/connector recovery. Set and demonstrate RPO/RTO. Provider archive counts and writable NFS alone are insufficient. |
| High: update and job crash recovery | `deployment/homecloud` pulls a branch and rebuilds; it has no automatic consistent application/database rollback. `docker-update-progress.js` tracks jobs/locks/results in a process-local Map and the background worker in `app.js` runs in that process. Caught-error container restoration is implemented, but does not execute after abrupt process loss. | Introduce versioned, reviewed releases and tested migration/rollback procedures; persist operation intent/results and reconcile interrupted updates before allowing retries. Test controller restart and network loss at each destructive update stage, including during rename/stop/replacement. |
| High: actual provider acceptance | The repository has protocol/UI fixture tests and disposable Compose controller checks. This review did not access the private Proxmox, Docker, TrueNAS, external channels or USB backup destination. | Publish exact supported provider/OS versions and run staged create/start/stop, image update, failed-update recovery, backup, restore and notification recovery tests on each supported combination. Verify restores by starting an isolated recovered guest and checking its data. Retest the existing inactive `media-storage` separately from the shared USB destination. |
| High for shared SaaS: customer isolation | `store.js` contains global infrastructure/configuration state; roles and database tables are installation-wide, without customer/tenant isolation. | Sell/install separate customer controllers for the current design. Shared SaaS needs deliberate tenant boundaries, scoped storage/credentials, isolation tests and a separate operational design. Multiple customers must not share this controller merely by creating different users. |
| Medium/high: durable state and audit | `store.js` uses JSON read/clone/write/rename; no recovery copy, fsync protocol or multi-process coordination is implemented. Corrupt JSON can prevent startup. Audit/database history and expired/revoked refresh rows have no universal retention cleanup; `/audit` returns only the latest 500 rows. | Prove crash/disk-full/corruption recovery, impose documented retention and capacity alerts, and support audit export. Use a durable store/worker design before horizontal scaling. Export privileged activity to an independently protected destination where customer requirements demand it. |
| Medium: reproducible releases and supply chain | There were no published GitHub Releases returned during this review. Compose uses mutable base image tags; no SBOM, container-image scan, signed artifact verification or release security gate is present in the checked workflow. npm package advisories are only one layer. | Establish a supported release/security-fix policy, reviewed versioned artifacts, dependency/image scanning, third-party licence inventory and a reproducible upgrade/rollback record. Pin reviewed digests when the release process can also keep them patched. |
| Medium: performance, browser and fleet acceptance | The production JS bundle is about 1.99 MB minified / 527 KB gzip, with about 497 KB CSS / 79 KB gzip, and eager page imports. No repeatable load/soak suite or measured customer fleet capacity is present. Browser tests do not establish physical iOS/Android or full accessibility acceptance. | Define supported fleet size and concurrency; measure navigation, first usable render, provider timeouts and memory/disk growth under load. Test keyboard/screen-reader navigation and real mobile browsers; split page bundles based on measurements. Avoid latency guarantees without end-to-end evidence. |
| Commercial operations | `TERMS.md` disclaims managed hosting, guaranteed recovery and support deadlines. `PRIVACY.md` delegates deployment-specific duties to the operator. Support-domain operation, incident handling, customer contracts and compliance were not verified here. | Define the paid offering, contact/response policy, incident process, supported platforms and exclusions. Publish installation-specific privacy/retention information and obtain appropriate commercial/legal review. Do not describe this assessment as legal compliance or security certification. |

## Validation performed

- API and web regression suites: baseline 829 passing tests; final suite includes the added role regression (830 tests).
- Targeted authentication/role regressions: five passing tests, including fixed remembered expiry and refresh replay protection.
- Production build passed on Node.js 24.19.0. The large chunk warning remains.
- npm advisory audits for the API and web lockfiles, including web development dependencies: zero known vulnerabilities at review time. This does not scan container OS packages or establish absence of undisclosed vulnerabilities.
- Updater/network shell checks, HTTPS configuration Python checks (2) and connector Python checks (22) passed. The isolated GitHub Compose smoke test must pass before merging these changes.
- Static review covered authentication/role boundaries, session storage, setup, provider configuration, state persistence, monitoring/notification status, Docker update/recovery paths, provider backup safeguards, deployment and existing policies. This was not a line-by-line proof of correctness or an independent penetration test.

No customer data, subscriptions, provider resources or running deployments were changed during this review. Docker was unavailable in the local execution environment; CI supplies the disposable Docker/PostgreSQL deployment check. The private production installation was not accessible.

## Pilot exit checklist

1. Apply the reviewed release on a staging installation; record source revision, provider versions and connector revisions.
2. Enforce HTTPS, private access and gateway MFA with direct access blocked. Use dedicated minimum-permission provider identities and document an owner recovery process.
3. Complete and record controller restore plus guest backup/restore drills. Confirm alarms for destination loss and actual delivery of failure/recovery notifications.
4. Exercise authorized and denied roles, remembered expiry, interrupted Docker updates, duplicate submissions, controller restart and provider outages on disposable resources.
5. Run a measured observation period at the advertised fleet size, retain sanitized results, and resolve failures. Set support expectations and maintenance windows with the pilot customer.
6. Approve general availability only after the applicable high-priority gates above have concrete test evidence. Implementing a feature without testing its recovery behavior does not close a gate.

## External references

- [Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json): Node 20 end-of-life and Node 24 support dates.
- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html): risks of JavaScript-readable session identifiers.
- [OWASP ASVS](https://owasp.org/projects/asvs): a structured basis for the next independent security verification. No ASVS certification or complete conformance is claimed.
