# Runtime integration configuration

Owners can configure Discord, Telegram and SMTP from Settings → Notifications. Integrations links to that workspace; delivery history does not repeat setup or test panels. TrueNAS, OPNsense and Tailscale use Settings → Connections → Other Services. Existing Proxmox and Direct Docker API forms remain unchanged.

1. Open Configure and enter the endpoint and required credentials.
2. Click Save Configuration. Changes apply without restarting HomeCloud.
3. Use Test Connection. Notification tests explicitly ask before sending a real message; provider tests perform only a read.
4. Enable configured notification channels using their delivery switches. A saved configuration is not evidence of successful delivery or provider permissions.

The popup retains entered values after a failed save. Closing a changed form asks before discarding. Saved tokens and passwords are never returned; blank secret fields retain their previous value. An optional SMTP password can be explicitly cleared together with its username. Disconnect overrides both saved and legacy environment credentials and stops HomeCloud use of that integration. It does not delete external resources.

## Fields and transport

- Discord: an HTTPS webhook on discord.com.
- Telegram: bot token and chat ID.
- SMTP: hostname, port, optional username/password, sender, recipient and optional trusted PEM CA. Port 465 uses implicit TLS; all other ports require STARTTLS. TLS verification stays enabled.
- TrueNAS: HTTPS origin, API key, current/legacy protocol and optional trusted PEM CA.
- OPNsense: HTTPS origin, API key/secret, current/legacy API style and optional trusted PEM CA.
- Tailscale: tailnet name and API key; the existing public HTTPS API is used.

The application still requires normal database, signing-key and deployment bootstrap configuration. This feature configures supported service connections rather than rewriting deployment files. Unsupported delivery adapters remain labelled unavailable.

## Storage and APIs

Credentials are AES-256-GCM encrypted under DATA_DIR/configuration using the existing JWT_SECRET key protection. Files are replaced atomically with mode 0600. Preserve the existing signing key and data volume during application updates and backups. Existing environment values remain a fallback until the service is saved or disconnected in HomeCloud.

Owner-only authenticated endpoints:

- GET /api/configuration/:service returns field metadata, nonsecret values and secret-presence flags.
- PUT /api/configuration/:service validates and saves known fields; unknown fields and services are rejected.
- DELETE /api/configuration/:service saves a disabled override.
- POST /api/configuration/:service/test checks the saved connection. Notification tests require confirm=true.

Mutations use the existing audit and cache-invalidation mechanisms. Audit results contain only masked configuration or sanitized test results. Tokens, passwords and webhook secrets are not written to audit records or returned in errors. Failed tests do not report success, restart guests or grant privileges.
