# Security and operational scope

Publisher attribution: **ATT-Tech**. Developer: **The Adekola**. Applies to the 3.1.0 release-candidate series; see [release policy](docs/release-policy.md).

i-Clusters controls privileged infrastructure. Use dedicated provider identities and grant only the permissions needed for the selected features. The MIT licence is not a security guarantee.

## Reporting vulnerabilities

Do not put credentials, private infrastructure details or an exploitable vulnerability in a public issue. Use **Security → Report a vulnerability** in the [GitHub repository](https://github.com/theadekola/i-clusters/security) if private reporting is enabled. If it is unavailable, open a minimal issue requesting a private contact channel without the vulnerability details or personal data. No response or remediation deadline is guaranteed.

Include the installed version/build/revision, affected feature, impact, sanitized reproduction steps and any temporary mitigation. Use disposable test resources. Do not test systems without their owner's authorization.

There is no formal long-term-support or backport commitment. Use the latest reviewed code available through your configured source and test changes with your provider versions before enabling sensitive actions.

## Implemented controls

- Optional authenticator MFA with encrypted setup keys, replay-resistant TOTP counters, one-time hashed recovery codes and password-verified self-service controls.
- Device sessions can be revoked on the server, including associated SSH access. Password changes and console recovery invalidate earlier sessions.
- Browser refresh credentials use Secure, HttpOnly, SameSite=Strict cookies, a same-origin custom-header/origin check, and refresh replay rejection. Short-lived access tokens remain JavaScript-readable; CSP does not remove all XSS risk.
- bcrypt password hashes; short-lived signed JWT access tokens; unique refresh tokens with rotation and replay rejection.
- Current account status and role checked on authenticated requests. Roles are viewer, auditor, operator, admin and owner; interface visibility alone is not the authorization boundary.
- Rate limiting, Helmet headers, configured origins and payload validation. These do not replace a deployment firewall or identity gateway.
- Supported connection/configuration popups are owner-only. Saved secret values are masked on reads and encrypted with AES-256-GCM using deployment key protection. Preserve the original signing/encryption key material for recovery.
- Resource- and payload-bound approval for sensitive infrastructure actions, with target SSH authentication where supported. SSH host identity must be verified. Do not blindly accept an unverified fingerprint.
- Proxmox restore targets must use unused guest IDs; i-Clusters does not request force overwrite.
- API and PostgreSQL ports are not published by the standard Compose deployment. The API filesystem is read-only apart from designated runtime and temporary mounts. Its container has no host Docker socket mount.
- Caddy HTTPS, including local CA support for LAN installations. Browser/node trust must be configured correctly. HTTPS transport alone does not certify deployment security.
- Optional direct Docker access supports verified mTLS; provider-specific trusted CAs are supported. Paired connectors avoid a TCP Docker listener in each guest.
- Node connectors use short-lived one-use pairing codes, hashed controller-side credentials and restricted supported requests. The node service runs with privileged host access; protect and update the host. Revoke an unused connector and uninstall its local service separately.
- Browser password visibility controls do not persist passwords. Remember this device persists sign-in for a fixed 10 days, enforced by server-signed tokens and browser expiry. Activity and refresh cannot extend it. Unchecked sessions use browser inactivity sign-out (30 minutes by default), which clears local tokens but is not server-side idle revocation.
- Docker read-only inspection omits environment variables, arbitrary labels and volume-driver options. Missing metric samples do not count as recovery of metric alerts.
- The AI assistant cannot execute actions. Requests use the configured fixed OpenAI endpoint and disable response storage; third-party policies still apply.

## Deployment responsibilities

Keep access private or use a suitable authenticated gateway. Dedicated Docker credentials can control the host; expose only authenticated encrypted endpoints and restrict their network reach. Limit Proxmox guest command privileges to intended VM paths, including the token's separate ACL where applicable. Inspect the permission impact before granting them.

Protect the Ubuntu host, database, runtime files, `.env`, signing keys, saved connector credentials and backups. Encryption of saved integration secrets does not encrypt every audit/state field or protect against a compromised controller host. Restrict file permissions, use trusted certificates, remove inactive accounts and rotate compromised credentials at the provider as well as in i-Clusters.

The updater is a privileged host service that fetches configured upstream code and rebuilds containers. Review changes, protect its checkout and service files, and retain a consistent controller backup. Build numbers and revisions aid identification; they are not signed supply-chain attestations.

## Boundaries and unsupported protections

Intrusion detection and an independent authenticated security assessment are not supplied by the application. Successful explicit browser sign-out revokes that device session; legacy sessions without a device identity revoke all sessions. Signing out does not cancel submitted provider jobs. Browser inactivity expiry is a local preference, not a server-wide idle-revocation policy.

Audit records capture submitted operations, failures and returned task identifiers. Provider tasks require later outcome checks. Database administrators can change audit records; the log is not cryptographically immutable. API reachability, successful configuration saves and queued actions are not proof of overall health, successful delivery or completed work.

Snapshots on a pool are not independent off-host backups. i-Clusters does not supply a generic Docker-volume/database backup runner. Configured external notification channels (including custom webhooks/IFTTT) and AI requests can send sensitive infrastructure information outside the installation. See [PRIVACY.md](PRIVACY.md).

## Validation boundaries

Automated regression tests use isolated provider fixtures and exercise approvals, restore safeguards, monitoring gaps, TLS and token handling. They cannot validate every real provider release, ACL, guest OS or network. Verify compatibility and restore procedures on disposable resources before relying on them in production.

## Connector maintenance through Connections

Connector update status and actions require the owner role. The SSH popup uses
fresh credentials without saving them, a pinned user-verified host fingerprint,
and explicit consent. A fixed remote script verifies the selected connector's
pairing ID and token hash locally before writing its own script. The raw pairing
token is never returned. Only the connector bundled with the running i-Clusters
release is eligible; arbitrary scripts, download URLs and service names cannot
be supplied by the client. Backups stay root-only on the paired host. Completion
requires a fresh matching code-revision heartbeat. SSH passwords and raw remote
output are excluded from update status, notifications and audit details.

## Release validation and response

CI gates tests, deployment, encrypted controller restore, production dependency checks and fixable HIGH/CRITICAL container-image findings. Reports and SBOMs accompany release candidates. Unfixed findings remain in scan reports and require operator review; they are not evidence of zero risk. Independent penetration testing and live provider/device acceptance remain separate gates. See [operations](docs/operations.md) for incident handling and recovery. Only one API controller process is supported per installation; local journals do not coordinate multiple writers.
