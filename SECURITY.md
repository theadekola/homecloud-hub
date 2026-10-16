# Security and operational scope

HomeCloud controls privileged infrastructure. Use dedicated provider identities and grant only the permissions needed for the selected features. The MIT licence is not a security guarantee.

## Reporting vulnerabilities

Do not put credentials, private infrastructure details or an exploitable vulnerability in a public issue. Use **Security → Report a vulnerability** in the [GitHub repository](https://github.com/theadekola/homecloud-hub/security) if private reporting is enabled. If it is unavailable, open a minimal issue requesting a private contact channel without the vulnerability details or personal data. No response or remediation deadline is guaranteed.

Include the installed version/build/revision, affected feature, impact, sanitized reproduction steps and any temporary mitigation. Use disposable test resources. Do not test systems without their owner's authorization.

There is no formal long-term-support or backport commitment. Use the latest reviewed code available through your configured source and test changes with your provider versions before enabling sensitive actions.

## Implemented controls

- bcrypt password hashes; short-lived signed JWT access tokens; unique refresh tokens with rotation and replay rejection.
- Current account status and role checked on authenticated requests. Roles are viewer, auditor, operator, admin and owner; interface visibility alone is not the authorization boundary.
- Rate limiting, Helmet headers, configured origins and payload validation. These do not replace a deployment firewall or identity gateway.
- Supported connection/configuration popups are owner-only. Saved secret values are masked on reads and encrypted with AES-256-GCM using deployment key protection. Preserve the original signing/encryption key material for recovery.
- Resource- and payload-bound approval for sensitive infrastructure actions, with target SSH authentication where supported. SSH host identity must be verified. Do not blindly accept an unverified fingerprint.
- Proxmox restore targets must use unused guest IDs; HomeCloud does not request force overwrite.
- API and PostgreSQL ports are not published by the standard Compose deployment. The API filesystem is read-only apart from designated runtime and temporary mounts. Its container has no host Docker socket mount.
- Caddy HTTPS, including local CA support for LAN installations. Browser/node trust must be configured correctly. HTTPS transport alone does not certify deployment security.
- Optional direct Docker access supports verified mTLS; provider-specific trusted CAs are supported. Paired connectors avoid a TCP Docker listener in each guest.
- Node connectors use short-lived one-use pairing codes, hashed controller-side credentials and restricted supported requests. The node service runs with privileged host access; protect and update the host. Revoke an unused connector and uninstall its local service separately.
- Browser password visibility controls do not persist passwords. Remember me chooses token storage. Browser inactivity sign-out defaults to 30 minutes and clears local tokens; it is not server-side token revocation.
- Docker read-only inspection omits environment variables, arbitrary labels and volume-driver options. Missing metric samples do not count as recovery of metric alerts.
- The AI assistant cannot execute actions. Requests use the configured fixed OpenAI endpoint and disable response storage; third-party policies still apply.

## Deployment responsibilities

Keep access private or use a suitable authenticated gateway. Dedicated Docker credentials can control the host; expose only authenticated encrypted endpoints and restrict their network reach. Limit Proxmox guest command privileges to intended VM paths, including the token's separate ACL where applicable. Inspect the permission impact before granting them.

Protect the Ubuntu host, database, runtime files, `.env`, signing keys, saved connector credentials and backups. Encryption of saved integration secrets does not encrypt every audit/state field or protect against a compromised controller host. Restrict file permissions, use trusted certificates, remove inactive accounts and rotate compromised credentials at the provider as well as in HomeCloud.

The updater is a privileged host service that fetches configured upstream code and rebuilds containers. Review changes, protect its checkout and service files, and retain a consistent controller backup. Build numbers and revisions aid identification; they are not signed supply-chain attestations.

## Boundaries and unsupported protections

Application two-factor authentication, intrusion detection and an independent security scanner are not implemented. Browser sign-out does not invalidate already issued access tokens before server expiry, stop submitted jobs or sign out other devices.

Audit records capture submitted operations, failures and returned task identifiers. Provider tasks require later outcome checks. Database administrators can change audit records; the log is not cryptographically immutable. API reachability, successful configuration saves and queued actions are not proof of overall health, successful delivery or completed work.

Snapshots on a pool are not independent off-host backups. HomeCloud does not supply a generic Docker-volume/database backup runner. Configured external notification channels (including custom webhooks/IFTTT) and AI requests can send sensitive infrastructure information outside the installation. See [PRIVACY.md](PRIVACY.md).

## Validation boundaries

Automated regression tests use isolated provider fixtures and exercise approvals, restore safeguards, monitoring gaps, TLS and token handling. They cannot validate every real provider release, ACL, guest OS or network. Verify compatibility and restore procedures on disposable resources before relying on them in production.
