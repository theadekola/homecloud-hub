# Docker image updates

i-Clusters checks registry image digests for the tags used by containers on connected Docker Engines. Checks run in the background, across the direct Engine and paired hosts. The default interval is six hours; owners can choose 1, 6, 12 or 24 hours or disable automatic checks under **Docker → Updates**. New or changed container inventory can trigger a fresh check. **Check for Updates** starts an explicit check. Checks never pull images, restart containers or install software.

A changed digest creates an informational alert and one notification per configured, enabled channel and container/digest. Configure channels under **Settings → Connections → Notifications** and use **Send Docker image update notifications** to control these messages. This switch is independent of severity and recovery filters; global notification and channel switches still apply. Failed delivery uses the existing bounded retry queue. An installed or superseded image update does not send a misleading recovery notification. The header alert opens Updates on the corresponding host after verifying that Engine.

## Review and install

Owners choose **Review & Install**, inspect the container, tracked tag, immutable digest, mount/network counts and interruption notice, and approve **Pull & Install Update**. Existing confirmation and paired-host SSH approval still apply. The review is bound to the selected host, container, original image and configuration. A changed review or a configuration change during download stops the action before the original container is stopped.

The installer:

1. Pulls the reviewed digest and verifies the downloaded image identity. A manifest/index change that leaves this platform's image unchanged does not restart the container.
2. Creates a replacement with user configuration, environment overrides, ports, actual volume identities, bind mounts, restart policy and supported network settings. New image defaults supply unchanged commands and metadata. Secret environment values are never returned in the review.
3. Stops a running original, disables its restart policy during the transaction, preserves its name for recovery, and transfers supported network attachments.
4. Starts the replacement only if the original was running. It checks running state and Docker health status, waiting up to about a minute for a configured health check. Without a health check, several running observations are required. A stopped container remains stopped.
5. Updates the local tag after success and removes the old container without deleting volumes. It then deletes only the previous image, without force or parent-image pruning, if no running or stopped container uses it and it has no remaining tag. Shared images are retained. Cleanup results appear in the successful installation message; cleanup failures do not roll back a verified replacement. If old-container cleanup fails, the response names its stopped backup and notes that its restart policy is disabled.

Startup failure attempts to remove the replacement without deleting volumes and restore the original name, networks, restart policy and running state. Incomplete restoration is reported explicitly. This is container-level restoration, not a database or filesystem backup. Application migrations may alter shared data. Files stored only in the old writable container layer are not copied into the replacement. Back up important application data before upgrading.

Compose-managed containers can be updated individually; the Compose file and other services are unchanged. Use Compose or the original deployment tool for coordinated stack upgrades. Swarm tasks, automatically removed containers, legacy linked containers, containers sharing another container's namespaces and containers used as namespace/lifecycle providers by other containers are not automatically recreated. Non-Linux containers and unsupported mount/port configurations require their original deployment tool.

## Limits and unavailable checks

Checks follow the existing tag; they do not discover a different version tag or automatically move `app:1` to `app:2`. Digest-pinned and local-only images are not tracked. Registry authentication requirements, network failures, rate limits, missing repository digests and unsupported responses appear as **Unable to check**, rather than **Current**. An unavailable check does not clear an existing update alert. A changed multi-platform index digest may not change the image for the host's platform.

Paired hosts need the connector bundled with the current i-Clusters release to relay registry-distribution requests. Update i-Clusters and then update each paired node or standalone connector under Connections. No Docker API port needs to be exposed, and no registry password is added to notifications or browser responses.

Update results use a three-column desktop card grid, two columns on tablets and
one column on phones. Each card keeps its image reference, status, registry
digest and available Review & Install action together.

### Installation progress

The update dialog shows a live percentage, the active installation stage and
elapsed time. Percentages estimate overall installation progress from configuration checks,
Docker layer download/extraction records and later verification milestones: configuration checks, pulling, digest verification, preparing the
replacement, switching, health verification, and cleanup. Pulling starts at 20% and live layer records advance its estimate up to 60%.
Downloaded MiB, layers ready and time since last download activity are shown.
Layer totals can change during discovery, so this remains an overall estimate,
not an exact byte percentage. Digest verification begins at 65%. A minute without
new layer activity is called out while the request remains pending.

Progress is read from the API every 1.5 seconds and is scoped to the owner,
selected Docker host, container and unique installation attempt. A failed progress
read retries without starting another installation. Failed verification shows the
restoration stage and never reaches 100%. A successful result shows 100% and the
existing success message before closing automatically. An unconfirmed install
response asks the owner to check the container before retrying. No updates start
from progress reads. Old progress is temporary and does not contain credentials
or container environment values.

Host authentication prompts appear above the update review dialog. A prompt
opens immediately while saved SSH connection details load, with an eight-second
limit on that optional lookup. If lookup fails, the manual SSH authentication
form remains available. Cancelling closes only the authentication prompt and
allows a new attempt. Installation progress remains at 0% until the required
approval and host authentication are complete; a hidden prompt must not prevent
users from approving the operation.

### Reliable pulls through paired hosts

After updating i-Clusters, update the relevant paired node connector under
Settings → Connections using **Update Connector**. Version 6 is required before
installing image updates through paired hosts. Older connectors receive an
explicit upgrade-required result before any container is stopped.

The connector keeps the raw Docker pull stream in a temporary directory inside
the target guest and reads bounded 16 KiB tails. Layer snapshots travel through
its existing authenticated outbound poll. This avoids oversized QEMU Guest Agent
responses and keeps registry errors separate from download activity. The temporary
directory is removed after the attempt. Direct Engine connections consume the
response stream incrementally instead of buffering the full log.

Downloads have a 15-minute hard deadline, with additional bridge transport grace.
Failed downloads report registry/network/disk checks and leave the original
container untouched. The replacement still requires the reviewed image digest,
fresh configuration/dependency checks, and startup/health verification.
Connector-update payloads are compressed to fit SSH execution packet limits;
source hashes, host verification and pairing checks remain enforced.

Registry checks allow 20 seconds for local image inspection and 45 seconds for each registry lookup, including paired transport time. Transient DNS, timeout and server/connection failures receive one bounded retry. Authentication, missing tags, TLS and rate-limit failures are reported separately without exposing raw registry messages or credentials. A healthy Docker connection does not establish registry reachability.

### Selected-host checks and retained alerts

**Check for Updates** reads the selected Docker host directly, independently of the background fleet scan. It reads only the container list and Engine identity, without waiting for statistics, volumes, networks or unrelated hosts. The request queues background work immediately; the page shows the inventory stage followed by completed/total image counts and publishes finished image checks in batches. Repeated clicks share the same selected-host work. A selected-host recheck remains available while automatic fleet checks run.

A healthy parent Proxmox connector heartbeat does not prove that its guest Docker inventory was read. When guest inventory is unavailable, prior update alerts remain unresolved and installation remains unavailable until a fresh registry observation succeeds. The page explains guest inventory failures separately from registry failures. A newer selected-host result cannot be overwritten by an older fleet scan. Other hosts’ rows and alerts are preserved.

### Background installation and recovery

The current web client submits an approved installation as a background job and immediately receives an operation identifier. Execution no longer depends on keeping a long HTTP request open. Confirmation and target SSH authentication still complete before the job starts. Jobs and their results remain scoped to the owner, exact host, container and attempt. Repeating the same attempt returns its existing job instead of launching another installation; concurrent attempts for a container are rejected.

The browser polls the job for progress, the verified result or a retained failure explanation. An acknowledgement is never shown as 100% completion. Failures keep the dialog open. Success appears before automatic closure and remains in the page’s status message. The session stores only the public review and operation metadata, without passwords or tokens, under the owner and host. Reopening Docker Updates in the same browser tab restores an accepted operation without submitting it again. Refreshing inventory or rotating an access token does not unmount the Updates dialog.

Jobs execute in the API process with encrypted durable checkpoints. Browser navigation/disconnection does not cancel an accepted job. Restarting the API marks running or recovering jobs interrupted and retains their container locks. Recover Interrupted Update exclusively claims that attempt; overlapping recovery and new installations are rejected until it finishes. Recovery verifies container identity, name, running state, restart policy, network aliases and configured static network addresses. Ambiguous results stay interrupted. It never starts another installation automatically. Browser progress restoration uses the same owner, host and tab.

Before contacting the registry, the installer inspects the reviewed immutable image reference locally. If its identity and repository digest match the review, it reuses that downloaded image and proceeds through replacement and health verification. A manually completed pull can therefore be reused without another download. Otherwise the bounded registry pull remains necessary. Mounted data and existing rollback checks remain preserved.

## Bounded checks (v1.0.0)

Manual inventory has a 30-second deadline. The registry phase uses rolling workers (four per scan, at most two per host), a two-minute scan budget, ten-second image inspections and fifteen-second registry requests. Transient failures receive one bounded retry. Results appear individually; unknown or timed-out checks retain existing update alerts. Large or slow inventories may require another check; an incomplete scan is never proof that an image is current. Active status refreshes every two seconds without adding a global spinner. Image downloads and installation progress use their separate operation deadlines.
