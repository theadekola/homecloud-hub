# Persistent software update notice

The automatic header message expired after five seconds. The icon was hidden when worker status was stale or unavailable, and the notification feed changed a known update into a generic worker warning. A missed toast could leave the owner without an obvious update prompt.

An owner-only notice now remains above page content while an update is available. It polls status every ten seconds and refreshes on focus, connectivity recovery, visibility changes and update-status events. Known updates remain identified during stale or failed checks, with the worker problem explained. Review Update opens About; the notice never queues an installation. Completed installations clear it. The redundant automatic header toast is suppressed so it cannot cover the persistent notice. Explicit checks in About retain their feedback.

Validation completed before the workspace disconnected:

- Full web suite: 598 passed.
- Final focused UI suite after suppressing the redundant header toast: 43 passed.
- Updater bridge and header notification API tests: 14 passed.
- Deployment worker fixture checks passed.
- Final production TypeScript/Vite build passed.
- Browser fixture checks: eight available-update layouts, two stale-worker layouts and two viewer layouts at desktop/mobile sizes passed.
- Mobile screenshot inspected. A final additional persistence/screenshot rerun was interrupted by workspace disconnection; its result was not retrieved.

No live VM or provider was accessed. The running VM's updater service and network connectivity still need live verification if updates remain undetected after deployment.
