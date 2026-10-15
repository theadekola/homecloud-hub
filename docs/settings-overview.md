# Settings overview

Settings → General uses a responsive nine-card overview: Site Information,
Regional Settings, Preferences, UI & Display, Dashboard Layout, Units &
Measurement, Session & Access, System Actions, and About. Search filters the
current section. Section buttons provide System, Security, Notifications,
Connections, Integrations, Appearance, Backup & Restore and Advanced views.
Connections retains its existing connection inventory and health guides.

## Save behavior

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
