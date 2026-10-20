# Usernames, remembered devices and automatic sign-out

New owner registration and administrator-created accounts use a unique username, display name and password. Email is optional at the API level and is not required by the interface. Usernames contain 3–64 letters, digits, dots, underscores or hyphens and start with a letter or digit. They are stored in lowercase and compared without case sensitivity.

Existing accounts retain their IDs, passwords, roles and email addresses. The database migration creates usernames from the email local part and adds numeric suffixes for collisions. Administrators can see usernames in Users. Existing email sign-in remains available as a compatibility fallback, so migration does not require guessing a generated username. Email-based legacy account-creation requests remain supported when their local part is a valid username; uniqueness conflicts return an error.

**Remember this device** is unchecked by default. Unchecked sign-ins use tab session storage and the configured browser inactivity timeout (30 minutes by default). Checked sign-ins use persistent browser storage for a fixed ten days from successful login. This deadline is embedded in server-signed access and refresh tokens and also tracked by the browser. Activity and token rotation never extend it. At expiry, the browser signs out and the server rejects the credentials. A fresh password sign-in with the box checked starts a new ten-day period. Passwords are not stored by this option.

In **Settings → Security → Active Sessions**, the inactivity preference applies only to unchecked sessions. Typing, taps and scrolling extend that inactivity deadline; polling, refresh and focusing a window do not. Sleeping tabs are checked when they wake, regain focus or become visible. Remembered tabs share their absolute expiry. Expired sessions clear both tokens, and a late refresh response cannot restore a signed-out session. Older stored sessions without the new deadline retain their previous inactivity behavior until a new sign-in.

Sign-out does not cancel already submitted server jobs or sign out other devices. The browser inactivity preference is not a server-wide idle revocation policy. The remembered-session absolute limit is enforced on the server.

The sign-in page includes password visibility and disables submission while login is pending. Page requests load quietly without a floating loading indicator or spinner.
