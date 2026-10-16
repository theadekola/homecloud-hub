# Sign-in and automatic sign-out

Use the eye button beside Password to show or hide the entered value. This does not submit the form or store the password.

**Remember me on this device** is unchecked by default. Unchecked sign-ins use browser tab session storage. Checked sign-ins use persistent browser storage, subject to the existing server token lifetime. Token refresh preserves the selected storage mode. Passwords are never stored by this option.

In **Settings → Security → Active Sessions**, select **Auto sign out after inactivity**. The default is 30 minutes; available choices are 5, 15, 30, 60, 120 and 480 minutes. Changes apply immediately to this browser and persist across reloads. They also apply to remembered sign-ins.

Typing, taps and scrolling count as activity. Background API polling, token refresh, and simply focusing a window do not extend the deadline. Sleeping tabs are checked when they regain focus or become visible. Expired sessions clear both access and refresh tokens and show the sign-in form with an inactivity explanation. A refresh response arriving after logout cannot restore the session.

This is browser inactivity protection, not server-side token revocation or a deployment-wide session policy. It does not stop already submitted jobs, sign out other devices or invalidate an already issued access token before its server expiry. Remembered tabs share their activity deadline; unchecked sessions have their own tab deadline. The timeout preference is shared within the browser.
