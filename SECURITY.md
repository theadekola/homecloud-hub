# Security and operational scope

HomeCloud Hub controls privileged infrastructure through provider APIs. Use dedicated identities and grant only needed privileges.

## Implemented controls

- bcrypt password hashing and short-lived JWT access tokens
- unique refresh tokens, rotation and replay rejection
- account status and current role checked on authenticated requests
- viewer, auditor, operator, admin and owner permissions
- rate limiting, Helmet headers and origin configuration
- PostgreSQL user records and application audit events
- sensitive infrastructure actions require resource- and payload-bound approval; target SSH authentication is used where available
- restore requests use unused guest IDs and never request force overwrite
- API and PostgreSQL ports are not published by Compose
- API filesystem is read-only except its mounted runtime directory and temporary filesystem
- Caddy terminates HTTPS when configured with a suitable real hostname
- Docker mTLS and provider CA certificates are supported
- owner-only runtime configuration stores encrypt credentials at rest and never return saved secret values
- administrator SSH shell and SFTP access requires target authentication and verified host identity
- assistant reads measurements and cannot execute actions

The API has outbound network access to reach configured providers. Keep access to HomeCloud Hub private or protect it with a suitable access gateway. Privileged Docker access can control the host; protect the endpoint with mTLS or a private authenticated gateway.

## What is not promised

API reachability is not comprehensive health or a security certification. Monitoring cannot infer unreported values. Audit logs record submitted actions, failures and returned task IDs; task history is used for provider completion status. PostgreSQL administrators can modify stored audit records, so these are not cryptographically immutable logs.

Application two-factor authentication and security scanning are not implemented. Discord, Telegram and SMTP delivery are supported. Application updates require an enabled updater deployment. The assistant supports an owner-configured OpenAI connection and cannot execute actions. Backup archives and ZFS snapshots have different failure protection; a snapshot alone is not an independent backup.


## Validation boundaries

Local regression tests exercise provider protocols against isolated test servers and check confirmation, restore protection, monitoring gaps and token handling. Successful local tests do not verify every supported provider release or a user's network. Before enabling real destructive actions, validate on disposable guests, containers and datasets with your actual provider versions and ACLs.

Read-only Docker inspection omits environment variables, arbitrary labels and volume driver options. Missing measurements do not count as recovery of metric alerts.
