# Changelog

Developer: **The Adekola** · Company: **ATT-Tech**.

## 3.1.0-rc.2 — 21 October 2026

- Bound page/authentication response waits and ordinary action responses, including stalled response bodies. Long guest setup and image build/pull operations retain a separate deadline; timed-out writes are never automatically resubmitted.
- Replace pair barriers with rolling Docker registry workers, publish completed image results, enforce a two-minute registry scan budget, and retain unresolved alerts for unknown results.
- Refresh Docker check status every two seconds while active; retain quiet normal polling and no global loading spinner.
- Load the terminal implementation only when opened, reducing the startup JavaScript chunk.
- Live browser timing remains blocked by an installation-specific certificate mismatch; configured intervals and fixture measurements are not a live-fleet guarantee.

## 3.1.0-rc.1 — 20 October 2026

Release candidate for controlled evaluation, not a general-availability certification.

### Added

- Optional authenticator MFA, one-time recovery codes, password changes, device-session revocation and host-console account recovery.
- Secure HttpOnly browser refresh cookies, frontend CSP and fixed remembered-session deadlines.
- Encrypted durable Docker operation checkpoints and explicit interrupted-update recovery.
- Best-effort screen wake locks during visible software and Docker installation views.
- Encrypted controller backups, offline source/history restoration, encryption-key validation and isolated restore drills.
- Consistent local upgrade recovery points and health-failure rollback.
- Versioned release notes, component inventories, container vulnerability scanning, acceptance and operations guides.

### Fixed

- Runtime images update Alpine packages, remove unused bundled npm tooling, rebuild Caddy 2.11.7 with patched Go HTTP/2 dependencies, and replace PostgreSQL’s outdated Go privilege helper with su-exec without changing PostgreSQL major version.

- Concurrent recovery attempts now exclusively claim a Docker operation and block new installations until recovery finishes.
- Recovery verifies restored restart policy, network aliases and configured static network addresses before reporting success.
- MFA renewal cannot inherit a later password-reset/revocation generation.
- Obsolete backup-storage alerts resolve when a fresh provider observation explicitly removes backup capability; this does not repair a mount.
- Page imports load lazily and account-scoped caches survive access-token rotation.
- Public attribution uses The Adekola and ATT-Tech across current source, policies and package metadata.

### Migration and limitations

Existing account IDs and passwords remain. MFA is optional and disabled until users verify enrollment. Legacy refresh clients remain supported. Preserve signing/encryption keys and back up the controller before updating. Use one API process and one controller per customer. Browser wake locks can be refused or released. Application data migrations inside containers require independent data backups. Complete the [acceptance checklist](docs/acceptance-checklist.md) before customer production use.

## Earlier development builds

The repository previously reported version 3.0.0 across multiple development commits. Git history and the historical audit files describe those changes; this changelog does not invent separate published releases for them.
