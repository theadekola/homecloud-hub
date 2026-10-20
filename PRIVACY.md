# Privacy and data handling

Effective date: 16 October 2026.

This document describes the i-Clusters application's data flows. It is not a privacy notice for every independently operated installation. The person or organisation operating an installation decides its access, connected systems, retention, backups and any additional proxy or hosting logs. Contact that operator about data on their instance.

## Information processed

| Information | Purpose and location |
| --- | --- |
| Account name, username, optional email, role, status and password hash | Authentication and access control in the controller's PostgreSQL database; passwords are hashed with bcrypt |
| Refresh-token hashes, approval and audit records | Session rotation, authorization and recorded application actions in PostgreSQL |
| Provider inventory, hostnames, addresses, measurements, alerts and activity | Infrastructure management and local persisted runtime state |
| Supported integration secrets and saved connection details | Server-side connection configuration; supported credential stores encrypt secret values using deployment key material |
| SSH/SFTP credentials and terminal/file data | Authenticated operations against the selected target; saved SSH details are managed separately from active sessions |
| Browser tokens and preferences | Sign-in, selected Docker host, appearance and dashboard preferences in browser local/session storage |
| Notification delivery records | Local delivery queue/history, errors and captured alert information |

Infrastructure names, IP addresses, logs, filenames and prompts may contain personal or confidential information. Exports and backups can contain this data. Not every application state field or audit record is encrypted; protect the server and backup storage. Never upload environment files or unredacted logs to public issue reports.

## Requests outside the installation

- Proxmox, Docker, TrueNAS and SSH targets receive the configured requests needed for their connected features.
- Enabled Discord, Telegram, SMTP, Slack, Teams, Pushover, Gotify, custom webhook or IFTTT channels receive alert/source/details and recovery messages. Tests send a user-confirmed request to the configured destination. Custom receivers and IFTTT applets can perform downstream actions.
- When AI is configured and used, OpenAI receives the user's question and selected infrastructure measurements. AI requests set `store: false`; that setting does not replace the provider's own processing or retention policy. Connection tests use a small test prompt. Model discovery uses the configured key without an assistant completion.
- The optional host updater contacts the configured Git upstream, normally GitHub. Installation/build/update tooling also downloads selected packages and container images.
- External documentation, repository, portfolio and social links open their respective sites when followed.

The bundled application has no built-in advertising or analytics tracking service. This does not describe tracking added by an installation's hosting, proxy, browser extensions or modified builds. Third-party destinations apply their own policies; the operator chooses whether to configure them.

## Browser storage and sessions

Remember this device uses persistent browser storage for a fixed ten days from successful sign-in; activity and token rotation do not extend the deadline. Unchecked sign-in uses tab session storage and the configured browser inactivity timeout. Signing out clears stored access and refresh tokens in this browser. It does not remove server records, revoke every issued token or sign out other devices. See [browser sessions](docs/browser-sessions.md).

## Retention, access and deletion

Different stores have different lifetimes. Header activity is bounded and notification previews are limited; audit/database records, exports, backups, configuration files and external deliveries can outlive those views. There is no universal automatic erasure period or complete user-data deletion workflow.

The operator should define retention, restrict administrator access, remove unused connections and accounts, and manage database/runtime/backups consistently. Disconnecting an integration stops i-Clusters's use of its saved configuration; it does not erase messages or resources already created on an external service. Browser sign-out is not deletion of server data. Requests for account information, correction or deletion must go to the installation operator, who must also consider applicable obligations and backup retention.

## Security and changes

See [SECURITY.md](SECURITY.md) for controls, limitations and vulnerability reporting. This document will change when application data flows change. Operators providing i-Clusters to other people should publish their own contact details and deployment-specific privacy information rather than presenting this project document as their complete notice.
