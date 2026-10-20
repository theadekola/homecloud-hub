# Account security and installation recovery

## Optional MFA

Each signed-in user can open Settings → Security → Account security and select Enable MFA. Enter the current password, add the displayed setup key to an authenticator app, and verify a six-digit code. MFA remains off until that verification succeeds. Save the ten recovery codes somewhere outside this controller. Each code works once; generating replacements invalidates the old codes. Enabling MFA or replacing recovery codes revokes other sessions while renewing the current session. Disabling MFA and changing a password require the password and a second factor when enabled, then require a new sign-in.

The session list allows users to revoke their own devices. Revocation also closes associated SSH sessions and grants. Browser refresh credentials use an HttpOnly, Secure, SameSite cookie. Use the HTTPS controller endpoint, not plain HTTP. Remember this device retains the original fixed ten-day deadline; refreshing credentials does not extend it. Authenticator secrets and Docker operation checkpoints require the original JWT_SECRET. Preserve that key in encrypted backups.

A root administrator with host-console access can run `homecloud recover-account USERNAME` to reset a password without putting it into shell arguments. Add `--reset-mfa` only for an approved account recovery. This invalidates all sessions and records the recovery in the audit log.

## Installation and screen behavior

Software upgrades and Docker installs request a screen wake lock while their installation view is visible. Operating systems, battery settings and browsers may refuse or release it. Leaving the page or completing the operation releases it. No installation should depend on keeping a phone screen awake. This cannot prevent a host power failure or guarantee application compatibility after an image update.

Docker installations run on the controller with encrypted, durable progress. Closing or reloading the browser does not cancel the operation. After an API restart, interrupted replacements remain locked against duplicate updates. The explicit recovery action checks the original and replacement identities before restoring the original or verifying a completed replacement. Ambiguous states require inspection on the Docker host. Recovery never deletes volumes. Changes an application made to its own data require application backups; reverting a container image does not reverse a data migration.

## Controller backups

Install `age` from the operating system package repository and keep its private identity separately from the controller. Back up using a public recipient:

```sh
homecloud backup /absolute/off-controller-backup-directory age1YOUR_PUBLIC_RECIPIENT
```

This briefly pauses API and HTTPS services for a consistent database/runtime snapshot. It includes the database, runtime configuration, encryption keys, deployed source revision and local HTTPS authority. Transfer the encrypted archive off the controller. This is separate from VM/container backups and does not back up provider application volumes.

Restore to a NEW directory on an isolated host:

```sh
bash deployment/controller-restore.sh /path/controller.tar.age /path/private-age-identity /new/controller-directory
```

The command verifies archive checksums, creates isolated Compose volumes, restores the database and validates saved encryption keys. Prior sessions and recovery codes are invalidated. Application services remain stopped. Isolate provider networks and review domain/ports before starting the restored controller. Sign in with the authenticator, generate new recovery codes, then perform the planned acceptance checks. Never run the CI drill helper on an installation containing real data.

## Software upgrades

The standard `homecloud update` flow takes a private local database/runtime recovery point, retains the current API/web images, and restores those images and database if the replacement fails health checks. Local recovery points are under `/var/backups/iclusters`; manage their retention and free space explicitly. They are not an off-host backup. Maintenance blocks provider writes during the upgrade. Finish outstanding Docker operations before the first upgrade from an older release that lacks durable operation checks.

Health checks demonstrate service availability, not complete provider behavior. A release still needs staging acceptance with each supported provider, a verified fresh VM/container restore, a controller restore drill, and representative mobile/desktop testing. CI runs an isolated encrypted controller restore and MFA sign-in; it does not validate physical disks, LAN permissions, all provider versions or a commercial security assessment. Multi-tenant SaaS isolation is not provided by the single-controller deployment.
