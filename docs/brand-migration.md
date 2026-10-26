# i-Clusters name migration

The product and repository use **i-Clusters**. New installations use `/opt/i-clusters`, `sudo iclusters`, `i-clusters.service`, `iclusters-updater`, `iclusters-node-agent.service`, `@iclusters/api` and `@iclusters/web`. Downloads, configuration examples, request headers, browser storage, Docker labels and generated resource names use the new namespace.

## Existing controllers

Use the normal software update. The migration runs before Compose builds the replacement deployment, preserves the existing Compose project identity and volumes, and backs up the environment as `.env.before-iclusters`. Existing database names, database users, passwords, signing keys and encryption keys are preserved. Changing a database name or project namespace without migrating its data would create an empty installation.

After a healthy deployment, the standard installation folder is moved to `/opt/i-clusters`; the old folder remains a compatibility symlink for running upgrade processes. The canonical command and systemd units are installed, and the old updater timer and path are disabled. An existing old CLI command remains a compatibility alias. Custom install directories are not moved.

Browser preferences, selected Docker host and session deadlines move to the new keys without overwriting newer preferences. Legacy refresh cookies are accepted for rotation and both cookie names are cleared on logout. The existing MFA encryption format and key derivation remain unchanged. Old request headers remain accepted during client upgrades.

## Existing paired connectors

New pairings use the canonical connector paths. Existing pairings keep their credentials and can update through either the automatic update flow or the supported SSH updater. Compatibility reads detect the original config, script, update state and service when present, so an existing connector does not need to be revoked and paired again. Legacy Docker image-tracking labels and rollback containers remain recognised.

The historical name remains only in compatibility readers, migration tests and transitional upgrade entrypoints. Do not remove these merely to eliminate a text match: existing sessions, MFA secrets, connector pairings and controller volumes depend on those migration paths. Historical Git commits and previously published artifacts are not rewritten.
