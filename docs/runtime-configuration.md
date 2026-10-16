# Runtime integration configuration

Owners configure Discord, Telegram and SMTP under Settings → Notifications; TrueNAS under Settings → Connections; and the AI Assistant under Settings → Integrations.

1. Open Configure and enter the endpoint and required credentials.
2. Click Save Configuration. Changes apply without restarting HomeCloud.
3. Use Test Connection. Notification tests explicitly ask before sending a real message; provider tests perform only a read. AI settings can be tested before saving, as described below.
4. Enable configured notification channels using their delivery switches. A saved configuration is not evidence of successful delivery or provider permissions.

The popup retains entered values after a failed save. Closing a changed form asks before discarding. Saved tokens and passwords are never returned; blank secret fields retain their previous value. An optional SMTP password can be explicitly cleared together with its username. Disconnect overrides both saved and legacy environment credentials and stops HomeCloud use of that integration. It does not delete external resources.

## Fields and transport

- Discord: an HTTPS webhook on discord.com.
- Telegram: bot token and chat ID.
- SMTP: hostname, port, optional username/password, sender, recipient and optional trusted PEM CA. Port 465 uses implicit TLS; all other ports require STARTTLS. TLS verification stays enabled.
- TrueNAS: HTTPS origin, API key, current/legacy protocol and optional trusted PEM CA.

The application still requires normal database, signing-key and deployment bootstrap configuration. This feature configures supported service connections rather than rewriting deployment files. Unsupported delivery adapters remain labelled unavailable.

## Storage and APIs

Credentials are AES-256-GCM encrypted under DATA_DIR/configuration using the existing JWT_SECRET key protection. Files are replaced atomically with mode 0600. Preserve the existing signing key and data volume during application updates and backups. Existing environment values remain a fallback until the service is saved or disconnected in HomeCloud.

Owner-only authenticated endpoints:

- GET /api/configuration/:service returns field metadata, nonsecret values and secret-presence flags.
- PUT /api/configuration/:service validates and saves known fields; unknown fields and services are rejected.
- DELETE /api/configuration/:service saves a disabled override.
- POST /api/configuration/:service/test checks the saved connection. AI tests may include a configuration object to test an unsaved draft. Notification and AI tests require confirm=true.
- POST /api/configuration/ai/models lists text-model IDs using the saved key or a configuration draft, without saving it or generating a completion.

Mutations use the existing audit and cache-invalidation mechanisms. Audit results contain only masked configuration or sanitized test results. Tokens, passwords and webhook secrets are not written to audit records or returned in errors. Failed tests do not report success, restart guests or grant privileges.

## AI Assistant

An owner can open Settings → Integrations → Configure AI, or Configure AI on the Assistant page.

1. Select the OpenAI API type: Responses (default) or Chat Completions.
2. Enter an OpenAI API key, or leave it blank to retain the encrypted saved key.
3. Click Load Models to fetch available text-model IDs for the key. Pick a model from the dropdown, or choose Custom model and enter an ID. The list does not guarantee compatibility with the selected API type.
4. Click Test Connection before saving. It asks permission, sends a small potentially billable test prompt, and reports key, access, quota, model-format, timeout or network failures. It does not send infrastructure information or change active settings.
5. Click Save Configuration to apply the selected API type, key and model immediately. Testing alone never saves or enables a disconnected integration.

Assistant queries send current measurements and user text to the selected fixed OpenAI endpoint. Requests disable response storage. Responses uses `/v1/responses`; Chat Completions uses `/v1/chat/completions`. Model discovery uses `/v1/models` and does not generate a completion. Credentials and raw upstream error bodies are never returned or logged. Existing configurations without an API type continue using Responses. Disconnect disables the saved connection, including environment fallback.

Official API references: [Models](https://developers.openai.com/api/reference/resources/models/methods/list), [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
