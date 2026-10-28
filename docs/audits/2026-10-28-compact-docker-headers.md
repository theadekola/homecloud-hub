# Compact dashboard and Docker tab headers

Removed the dashboard Alerts & Updates widget and its customization option. The bell, alert summary metric and Alerts page remain available. Notification read errors remain visible in the dashboard's error feedback. System Resources and Infrastructure Health now share a dedicated two-panel row; CPU, memory and storage tiles share one desktop row. Narrow viewports reflow those panels and tiles to preserve readability.

Removed the separate Docker host-picker card and its duplicate connection-management link from Docker resource pages. Each Docker tab places a compact host selector in its title toolbar, including empty or disconnected resource views. Existing host verification and selection behavior remain intact. Network's independent host selector retains its existing default variant.

Removed the large Container image updates configuration card. Docker Updates now uses one icon-bearing page header with the compact host selector and Check for Updates action, followed by resource tabs and a short automatic-check status. Legacy disabled settings are enabled when an owner opens Updates. The existing backend scheduler and configured interval continue checking connected Docker hosts; the default interval is six hours. This enables registry checks only. Installation continues to require review and approval, and viewer access cannot change settings.

Added missing icons to eleven custom tab-page headings and made the shared page header select a Docker brand icon for Docker resource titles. Existing header icons remain in place.

Validation:

- 594 web tests pass, including host-picker placement and legacy automatic-check enablement.
- Existing Docker image-update API tests pass, including automatic-check cadence and explicit configuration behavior.
- Production TypeScript/Vite build passes.
- Browser review covers 94 main-page/section layouts at desktop and phone widths.
- An additional 16 screenshot-specific views and four dialogs pass compact-header checks: no removed cards, desktop resource alignment, host selector/title alignment and update-action placement.
- Git whitespace validation passes.

Browser requests use fixtures. These checks do not execute live container installs, host changes or SSH actions.
