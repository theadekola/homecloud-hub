# Settings overview

Settings → General uses a responsive nine-card overview: Site Information,
Regional Settings, Preferences, UI & Display, Dashboard Layout, Units &
Measurement, Session & Access, System Actions, and About. Search filters the
current section. Section buttons provide System, Security, Notifications,
Connections, Integrations, Appearance, Backup & Restore and Advanced views.
Connections retains its existing connection inventory and health guides.

## Edit and save behavior

Settings open in read-only mode with an Edit button. Edit unlocks supported fields
and replaces that button with Save Changes and Cancel. Cancel restores the latest
saved server values and browser preferences without sending a write. A successful
save returns to read-only mode; a failed save remains editable. Edit state and
drafts persist between settings sections. Opening Connections while editing asks
before discarding the draft. Read-only roles still cannot unlock shared settings.
Imports also require Edit before staging values for review.

Save Changes submits only the supported shared fields (`siteName`, `description`,
`refresh`) to the existing authenticated settings API for administrators/owners.
Role restrictions and server audit behavior remain unchanged. If that request
fails, the draft stays visible and browser preferences are not reported as saved.
Read-only roles can save personal preferences without requesting a shared-settings
write. Background API refreshes never overwrite a draft after it has loaded.

Appearance uses the existing `homecloud_appearance` accent, density and animation
preferences. Sidebar display is stored as `homecloud_sidebar`; the Layout applies
it on desktop while preserving the hamburger menu on mobile. Dashboard switches
use the existing `homecloud-widgets` list. Overview reads that list and responds
to preference changes. Customize Dashboard Widgets opens Overview’s existing
widget dialog. Save the overview draft before following that link.

## Working actions and explicit limits

- Regional information reports browser language, date/time formatting, device
  timezone and server timezone. It follows device settings; it is not an
  unimplemented language or timezone selector. Nonstandard locale tags safely
  fall back to the browser’s default formatter.
- Measurement conventions are informational. No global unit override is claimed.
- Session role and server-managed expiry are informational. No idle timeout,
  remember-me policy, sound notification, login notification or application 2FA
  switch is presented as implemented.
- Reload Interface reloads the current browser page after confirmation; terminal
  sessions may disconnect. It does not restart the controller or any guest.
- Clear Read Cache invalidates only in-memory API reads. Credentials, selected
  Docker host and browser preferences remain intact; mounted views revalidate.
- Refresh Settings reads current settings. Connection Health opens the existing
  owner-controlled connection checks. Software updates retain the existing
  owner-only updater workflow. A labeled update button cannot submit the settings
  form accidentally.
- Documentation opens the project repository. Version/host/runtime information
  comes from the existing API; no fictional build date or license is displayed.
- General-settings export includes only the three supported shared fields.
  Import is limited to 16 KiB, validates those fields and stages them for review.
  Applying an import requires Save Changes. Credentials, users and full application
  data are excluded; this is not a full application backup or restore.
- Infrastructure backups, notifications, rules, user management and provider
  diagnostics link to or reuse their existing workflows and permissions.

Verification covers saves, permission boundaries, failed-save draft retention,
local preferences, section/search navigation, safe import staging, invalid locale
fallback, and cache invalidation without logout. Rendered browser fixtures check
all sections at 320, 375, 390, 768, 1024, 1440 and 1920px. No live services or guests
are changed by the redesign or its tests.

## System section

The System tab follows the reference’s card layout with System Information,
System Behaviour, Resource Limits, Logging & Diagnostics, System Services,
System Maintenance, Danger Zone and System Backup.

Runtime metadata includes the OS/kernel, architecture, API process uptime and
server timestamp. These may describe a container, not the physical host. API
policy metadata comes from shared constants used by the actual JSON-body limit,
general rate limiter and monitoring scheduler. The values are informational and
cannot be changed through the settings write API. The general rate limit is per
client/IP; login and authenticated paired-agent polling retain separate limits.

The supported shared setting in System Behaviour is page refresh cadence.
Deployment boot policy, update source, session expiry, worker/session limits and
maintenance mode remain informational. System Services shows the last observed
API/provider readings, not fabricated daemon statuses or restart controls.

Auditors and higher roles can open or download the latest audit records from the
existing audit API. Owners can run existing provider read diagnostics and download
those results. Cache clear, data refresh and connection health remain available
without editing settings. Reload Interface retains a confirmation and can disconnect
open terminals; it does not restart services. Restart, reboot, stop-all, database
optimization, index rebuilding and factory reset are not implemented as remote
operations. System Backup exports only supported general settings; restore stages
a validated settings file and still requires Save Changes. No credentials or full
application data are included.


## Security settings

The Security tab follows the reference layout with Authentication, Access Control, Network Security, Active Sessions, Audit Logs, Security Status, Threat Protection and Danger Zone cards. It uses the shared Edit → Save Changes / Cancel workflow. Security policies are read-only deployment/runtime facts; editing does not enable unsupported authentication or network controls, and saving a supported settings draft never changes these policies.

The authenticated, read-only `/api/security` endpoint reports token lifetime configuration, role names, password creation requirements and the same authentication rate-limit constants enforced by Express. It does not return token values, signing keys, credentials or account lists. Authentication endpoints share 20 requests per 15 minutes per IP; this is not a per-account lockout. Password creation requires at least 12 characters and at most 72 UTF-8 bytes without composition rules.

Audit records load only when a permitted user requests them. The card previews five records from the existing latest-record API and provides the full audit-page link. Viewer accounts cannot request this preview; the backend continues enforcing auditor access. Failures are shown inline with a retryable load button. Current browser details come from the authenticated account and URL. Other devices, source IPs, last activity, session revocation, API keys, 2FA, firewall/Fail2Ban, intrusion detection and host security update management are not fabricated. HTTPS describes only the current URL scheme, not certificate validity or backend transport. Sign-out confirms its scope and clears this browser's tokens; it does not claim global revocation.

## Notifications settings

Notification management now lives at Settings → Notifications. Alerts retains Active Alerts, Alert History and Alert Rules. Existing `/alerts?tab=Notifications` links redirect to Settings; current rule, alert and security links point directly to the new page.

The page follows the notification reference with summary cards, configured channels, supported events, delivery preferences, recent records, test delivery and expandable full history. Owner-only delivery diagnostics and tests retain their server role checks. The default header shows Edit; switches and preference fields remain locked until editing. Save Changes uses the owner-only, audited `PUT /api/notifications/preferences`; Cancel restores saved values. Switching into or away from Notifications while editing requires discarding the current draft. Failed writes preserve the draft. General settings are not written when saving notification preferences.

Supported preferences are automatic external delivery enabled/paused, per-channel delivery for configured Discord/Telegram/SMTP, minimum active-alert severity and recovery delivery. Defaults preserve existing behavior. Preferences persist separately from general settings. The notifier applies them to new queue entries and eligible retries on subsequent flushes. Paused entries remain queued; enabling a channel can resume eligible retained retries and queue still-eligible alerts from the existing seven-day window. In-flight deliveries can complete. Minimum severity applies to active/acknowledged alerts; recovery delivery has its own switch. Explicit channel tests remain available even while automatic delivery is paused, require a separate confirmation in the new settings page, and do not depend on unsaved drafts.

The page never returns channel secrets or claims a configured channel is verified. Setup explains required server variables and API container recreation. Full delivery history preserves filtering, paging, details and retry diagnostics from the existing notification view. Retained delivery count is not represented as a 30-day total. Browser push, custom outgoing webhooks, quiet hours, digests, repeats and VM lifecycle/backup/security event delivery are identified as unavailable rather than shown as working controls. In-app alerts continue when external delivery is paused.
