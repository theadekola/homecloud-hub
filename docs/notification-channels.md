# Notification channels and alert preferences

Owners manage delivery in **Settings → Connections → Notifications**. Every channel has Setup, Enable and Test controls. Setup saves encrypted credentials on the HomeCloud server, without environment-file edits or a restart. Tests can use unsaved details after explicit confirmation; they do not save settings or enable automatic delivery.

| Channel | Setup fields | Provider setup |
| --- | --- | --- |
| Discord | Incoming webhook URL | Create a webhook in the intended Discord channel's integration settings. |
| Telegram | Bot token and chat ID | Create a bot with BotFather, start it or add it to the chat, and obtain the destination chat ID. |
| Email (SMTP) | Host, port, optional username/password, sender, recipient and optional trusted CA | Use a permitted relay and any required app password. Port 465 uses implicit TLS; other ports require STARTTLS. |
| Slack | Incoming webhook URL | Create a Slack app incoming webhook attached to the intended channel. GovSlack webhook hosts are also supported. |
| Microsoft Teams | Workflows webhook URL | Create an incoming-webhook workflow that posts an Adaptive Card. Use a URL that accepts the webhook request without interactive sign-in. Tenant policies or authenticated-only workflows can require additional setup outside HomeCloud. |
| Pushover | Application token, user/group key and optional device name | Create a Pushover application and use your own keys. Emergency priority and acknowledgment loops are not enabled. |
| Gotify | HTTPS base URL, application token and optional trusted CA | Create an application on your Gotify server. Use its application token, not the administrator password. |
| Custom Webhook | HTTPS URL, optional bearer token and optional trusted CA | Provide a receiver that accepts the documented JSON body below. Tests perform a real POST. |
| IFTTT | Event name and Webhooks key | Create a Webhooks **Receive a web request** applet matching that event. Requests supply `value1` (title), `value2` (source) and `value3` (details/time). Tests can trigger downstream applet actions. |

All HTTPS connections verify certificates. Redirects are not followed, so a receiver cannot redirect configured secrets elsewhere. Private Gotify or webhook certificate authorities can be entered as PEM certificates. Slack, Teams, Discord, Telegram, Pushover and IFTTT use their supported provider endpoints. No general browser-push subscription or arbitrary OAuth login is included.

Newly added channel switches default off. After saving, enable a channel deliberately and verify it with Test. Existing Discord, Telegram and email switches retain their stored settings. A successful request means the receiving service accepted it; it does not prove that a device displayed it or that an IFTTT action finished.

## Delivery preference checkboxes

Every channel's setup popup includes **Send notifications for** checkboxes. Select any combination, such as Critical, Warning and Recoveries. At least one category is required. Use All severities and recoveries to select or clear every category:

| Selection | Automatic messages eligible for this channel |
| --- | --- |
| All severities and recoveries | All otherwise eligible measured alerts and recoveries |
| Critical | Active/acknowledged critical conditions |
| Warning | Active/acknowledged warning conditions |
| Info | Active/acknowledged information-level conditions |
| Recoveries | Conditions monitoring has resolved |
| Unknown severity | Conditions with an unrecognized or missing severity |

These are exact categories, not minimum thresholds. The global master switch, channel switch, minimum severity and Send recovery notifications setting also apply. For example, selecting Info will not send information alerts if the global minimum is Warning; selecting Recoveries requires recovery delivery to be enabled. Tests intentionally bypass automatic-delivery filters.

The selection saves with the channel configuration when you press **Save Configuration**. Choosing it alone does not alter live settings. Existing single-category selections are preserved. Old saved configurations without a selection use All severities and recoveries. The API stores a canonical comma-separated string, for example `critical,warning,resolved`, in the channel’s `*_NOTIFICATION_FILTER` field; legacy `all` and single-category strings remain valid. Empty, repeated and invalid categories are rejected. Filters apply both when creating queue entries and before retrying pending entries. Changing a filter pauses ineligible retries; it does not resend messages already delivered.

## Separate and readable alerts

HomeCloud sends each alert/recovery separately, with its title, source, details and timestamp. Discord uses one embed per condition, with red critical, amber warning, blue information, grey unknown and green recovery cards. Slack wraps structured blocks in a single attachment with a matching colour bar. Teams uses an Adaptive Card with a red, amber, blue or green title (unknown uses the host’s default colour). SMTP includes an escaped HTML card with a matching border plus plain text. Telegram, Pushover, Gotify and IFTTT do not offer arbitrary coloured card borders through these APIs, so every message has a matching coloured status marker and status text instead. Recoveries always use green regardless of the previous severity. Display and exact colours depend on the receiving app and theme.

Recovery cards identify the previous condition as historical, rather than presenting its old error as a current failure. Existing already delivered messages are not rewritten. Long titles/details are bounded to provider payload limits. Discord mentions are disabled, Slack fields use plain-text blocks, and email HTML escapes alert content.

Delivery is queued and deduplicated per alert/event/channel. Failures use bounded retry backoff. If a provider accepted a request but its response was lost, a retry can duplicate it; delivery is not guaranteed exactly once. Global or channel preferences do not recall messages already accepted by a provider.

## Custom webhook payload

The receiver gets JSON with `application`, `title`, `source`, `details`, `event`, `severity`, `timestamp` and a plain-text `message`. A `card` object also provides `title`, `source`, `details`, `status`, hex `color`, Unicode `marker` and `timestamp` for receivers that render their own cards. HomeCloud cannot control how a custom receiver or IFTTT downstream action displays it. `event` is `active`, `resolved` or `test`. Timestamps are UTC ISO strings when known, otherwise null. An optional bearer token is sent in the Authorization header. The receiver should return a 2xx status to accept the event. Keep its URL and token private.

## Provider references

- [Discord webhook payloads](https://docs.discord.com/developers/resources/webhook#execute-webhook)
- [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/)
- [Teams incoming webhooks and workflows](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook)
- [Pushover API](https://pushover.net/api)
- [Gotify push messages](https://gotify.net/docs/pushmsg)
- [IFTTT Webhooks](https://ifttt.com/maker_webhooks)


## Automatic connection recovery messages

After monitoring confirms that an existing connection problem has recovered,
HomeCloud queues a green **Connection restored** notification for each configured,
enabled channel. It identifies the affected source, previous problem and recovery
time. This includes paired node connectors, Docker hosts and provider connection
failures. Acknowledging an alert does not mean its connection has recovered.

Newly confirmed connection recoveries bypass minimum severity, per-channel event filters and the
general recovery switch. The external-notification master switch and each channel's
enabled switch still apply. Metric recoveries retain their existing preferences.
Delivery is recorded separately per alert and channel, with bounded retries and
persistent deduplication across restarts. Provider outages can delay delivery;
monitoring never invents a recovery merely to send a message. Upgrading does not
retroactively bypass filters for old recovery records.
