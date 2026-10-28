# Refresh controls and fresh reads

The refresh controls had inconsistent pending state and no shared icon animation. Several controls delegated to callbacks without returning the request promise. Manual reads could also finish their UI state after receiving a partial provider scan, before the completed measurements arrived. Connection health ignored the manual refresh header, and Alerts did not request a new monitoring scan on a forced read.

## Changes

- 71 refresh/recheck controls now use `RefreshButton`. It starts visual progress immediately, holds the button disabled while its callback or supplied provider state is busy, prevents duplicate in-flight clicks and restores the control after success or failure. Unexpected callback failures are visible and retryable. A short visual tail makes even fast reads observable without delaying data or blocking a completed request. Reboot, reset-filter, pause-verification and browser-reload actions retain their existing behavior.
- Refresh glyphs rotate while the control reports visual progress. Reduced-motion preferences retain a non-rotating busy indication.
- Manual `useApi` refreshes force the first read, publish intermediate measurements and keep their promise pending while the provider reports `refreshing`. Continuation reads poll the same report without forcing new scans. The existing deadline, abort, actor/host scope isolation and queued refresh behavior remain in place.
- Network Devices waits for both sources. Storage Shares explicitly requests a fresh read. Pairing target/host rechecks expose their asynchronous loading state.
- Connection health accepts the manual refresh header as well as its existing query option. Alerts starts a fresh scan on demand and reports ongoing work to continuation reads.
- The browser audit can exercise visible refresh controls with delayed fixture requests using `LAYOUT_CHECK_REFRESH=1`. It checks request activity and computed animation, rather than only handler presence.

## Validation

The full API suite has 535 passing tests and the web suite has 593 passing tests. New regressions cover duplicate clicks, request completion, partial scan continuation without repeated force headers, failure/retry behavior, external busy state and backend refresh-header handling. The production TypeScript/Vite build passes. The static control audit reports no wiring issues among 691 native button templates; shared refresh controls are represented by the reusable button template.

Browser checks cover the main pages and section views at desktop and phone widths, including dashboard customization and SSH approval dialogs. Refresh requests are intercepted with fixtures; no live Proxmox, Docker, TrueNAS or SSH operation is performed. Live deployment behavior still depends on provider connectivity and access.
