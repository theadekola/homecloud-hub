# Usernames, remembered devices and automatic sign-out

New owner registration and administrator-created accounts use a unique username, display name and password. Email is optional at the API level and is not required by the interface. Usernames contain 3–64 letters, digits, dots, underscores or hyphens and start with a letter or digit. They are stored in lowercase and compared without case sensitivity.

Existing accounts retain their IDs, passwords, roles and email addresses. The database migration creates usernames from the email local part and adds numeric suffixes for collisions. Administrators can see usernames in Users. Existing email sign-in remains available as a compatibility fallback, so migration does not require guessing a generated username. Email-based legacy account-creation requests remain supported when their local part is a valid username; uniqueness conflicts return an error.

**Remember this device** is unchecked by default. Unchecked access/session markers use tab session storage and the configured browser inactivity timeout (30 minutes by default). Checked access/session markers use persistent storage for a fixed ten days from successful login. Browser refresh credentials use an HttpOnly cookie, as detailed below. This deadline is embedded in server-signed access and refresh tokens and also tracked by the browser. Activity and token rotation never extend it. At expiry, the browser signs out and the server rejects the credentials. A fresh password sign-in with the box checked starts a new ten-day period. Passwords are not stored by this option.

In **Settings → Security → Active Sessions**, the inactivity preference applies only to unchecked sessions. Typing, taps and scrolling extend that inactivity deadline; polling, refresh and focusing a window do not. Sleeping tabs are checked when they wake, regain focus or become visible. Remembered tabs share their absolute expiry. Expired sessions clear browser access/session markers, and a late refresh response cannot restore a signed-out session. Older stored sessions without the new deadline retain their previous inactivity behavior until a new sign-in.

Sign-out does not cancel already submitted server jobs or sign out other devices. The browser inactivity preference is not a server-wide idle revocation policy. The remembered-session absolute limit is enforced on the server.

The sign-in page includes password visibility and disables submission while login is pending. Page requests load quietly without a floating loading indicator or spinner.

## Server sessions and optional MFA (3.1.0 release candidates)

The browser refresh token is a Secure, HttpOnly, SameSite=Strict cookie. JavaScript stores only the short-lived access token and session/deadline markers. Native/legacy API clients retain body-based refresh support. Explicit logout revokes the current server session; legacy sessions without a device ID revoke all sessions. Settings → Security lists revocable sessions for the current account and supports password changes. Revocation also closes associated SSH sessions and action grants. Optional MFA uses an authenticator setup key and ten one-time recovery codes. Disabling MFA or changing a password requires reauthentication and a fresh sign-in afterward. Browser inactivity expiry clears local access but is not server-side idle revocation.
