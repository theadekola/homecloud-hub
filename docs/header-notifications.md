# Header notifications

The bell is available throughout the signed-in application. Its badge counts unacknowledged active alerts visible to the current user and owner-visible pending update notices. Acknowledged alerts do not increase the badge, even while unresolved. Recent activity remains in the popup with its own unread indicator and does not increase the bell badge. When no unacknowledged alerts or pending update notices remain, the bell has no numeric badge even if acknowledged alerts or unread activity remain. It refreshes from local persisted state every 10 seconds, after application writes and when the browser regains focus. It does not run a new provider scan each time.

## Alerts that need attention

Active and acknowledged alerts remain in the bell until the monitoring engine confirms recovery or their monitoring configuration is explicitly removed. Removal closes the alert without claiming recovery. A paired node that remains configured but is offline still needs attention. Acknowledging an alert or marking activity as read does not resolve it. Partial or missing provider samples do not imply recovery. The popup lists all outstanding alerts, with the first 50 displayed in severity order. Its summary separates items needing attention from acknowledged alerts. Badge counts and acknowledged totals are computed before the preview is limited, so acknowledged alerts outside the first 50 are also excluded. Owners also see an available update or an updater failure.

## Recent activity

The feed records meaningful HomeCloud mutation requests: infrastructure actions, backups, storage, network and VPN changes, alert administration, settings, connections and connector configuration. It includes safe success/failure summaries and identifies accepted asynchronous work as queued, without claiming the remote job finished. Sign-ins and remote access actions are private. Routine reads, polling, shell keystrokes and repeated successful upload chunks are excluded. A file upload entry confirms its first chunk, not the entire transfer.

Existing monitoring scans add observed provider, node, VM, CT, Docker container and storage job state transitions, plus confirmed alert recoveries. The first sample establishes a baseline. Events outside HomeCloud become visible only when covered by the existing monitoring. This feed is not a complete audit log or a replacement for provider task history.

The server retains the newest 500 activities and displays the newest 50 permitted entries. Read cursors are per account, persist across sessions and only apply to retained activities. Shared infrastructure events are visible to signed-in users. Account, remote access, credential configuration, connection and updater actions are visible only to their actor and owners. Stored summaries exclude request bodies, credentials, raw error responses, terminal input and file contents.

Open an item to review its related page. Use **Mark activity read** to clear unread activity; outstanding alerts remain. **View all alerts** and **Alert history** provide the full alert views. If the feed cannot load, the bell shows an error indicator and the popup offers Refresh. No browser push permission or external delivery channel is needed. External delivery remains configured separately under Settings → Connections → Notifications.

## Observation accuracy

Alert titles, severity and details follow the latest matching observation, including transitions between failed and partial connections. Threshold alerts require finite measurements from an available resource. The popup distinguishes first-reported time from last-confirmed time. Monitoring observations older than three minutes are unverified; Docker update notices require a matching available registry result checked within 24 hours. A failed or unknown registry check leaves the earlier alert unresolved and unverified. This does not claim that an update is currently confirmed.

If a notification refresh fails, cached items remain visible as previous observations, while the numeric badge and current summary are withheld. External delivery cancels queued failures after recovery or configuration removal and retries using current alert metadata. Configuration removal does not send a recovery message. Expired observations, invalid event dates and event dates more than one minute ahead do not generate new deliveries.
