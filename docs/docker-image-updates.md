# Docker image updates

HomeCloud checks registry image digests for the tags used by containers on connected Docker Engines. Checks run in the background, across the direct Engine and paired hosts. The default interval is six hours; owners can choose 1, 6, 12 or 24 hours or disable automatic checks under **Docker → Updates**. New or changed container inventory can trigger a fresh check. **Check for Updates** starts an explicit check. Checks never pull images, restart containers or install software.

A changed digest creates an informational alert and one notification per configured, enabled channel and container/digest. Configure channels under **Settings → Connections → Notifications** and use **Send Docker image update notifications** to control these messages. This switch is independent of severity and recovery filters; global notification and channel switches still apply. Failed delivery uses the existing bounded retry queue. An installed or superseded image update does not send a misleading recovery notification. The header alert opens Updates on the corresponding host after verifying that Engine.

## Review and install

Owners choose **Review & Install**, inspect the container, tracked tag, immutable digest, mount/network counts and interruption notice, and approve **Pull & Install Update**. Existing confirmation and paired-host SSH approval still apply. The review is bound to the selected host, container, original image and configuration. A changed review or a configuration change during download stops the action before the original container is stopped.

The installer:

1. Pulls the reviewed digest and verifies the downloaded image identity. A manifest/index change that leaves this platform's image unchanged does not restart the container.
2. Creates a replacement with user configuration, environment overrides, ports, actual volume identities, bind mounts, restart policy and supported network settings. New image defaults supply unchanged commands and metadata. Secret environment values are never returned in the review.
3. Stops a running original, disables its restart policy during the transaction, preserves its name for recovery, and transfers supported network attachments.
4. Starts the replacement only if the original was running. It checks running state and Docker health status, waiting up to about a minute for a configured health check. Without a health check, several running observations are required. A stopped container remains stopped.
5. Updates the local tag after success and removes the old container without deleting volumes. If old-container cleanup fails, the response names its stopped backup and notes that its restart policy is disabled.

Startup failure attempts to remove the replacement without deleting volumes and restore the original name, networks, restart policy and running state. Incomplete restoration is reported explicitly. This is container-level restoration, not a database or filesystem backup. Application migrations may alter shared data. Files stored only in the old writable container layer are not copied into the replacement. Back up important application data before upgrading.

Compose-managed containers can be updated individually; the Compose file and other services are unchanged. Use Compose or the original deployment tool for coordinated stack upgrades. Swarm tasks, automatically removed containers, legacy linked containers, containers sharing another container's namespaces and containers used as namespace/lifecycle providers by other containers are not automatically recreated. Non-Linux containers and unsupported mount/port configurations require their original deployment tool.

## Limits and unavailable checks

Checks follow the existing tag; they do not discover a different version tag or automatically move `app:1` to `app:2`. Digest-pinned and local-only images are not tracked. Registry authentication requirements, network failures, rate limits, missing repository digests and unsupported responses appear as **Unable to check**, rather than **Current**. An unavailable check does not clear an existing update alert. A changed multi-platform index digest may not change the image for the host's platform.

Paired hosts need the connector bundled with the current HomeCloud release to relay registry-distribution requests. Update HomeCloud and then update each paired node or standalone connector under Connections. No Docker API port needs to be exposed, and no registry password is added to notifications or browser responses.

Update results use a three-column desktop card grid, two columns on tablets and
one column on phones. Each card keeps its image reference, status, registry
digest and available Review & Install action together.

### Installation progress

The update dialog shows a live percentage, the active installation stage and
elapsed time. Percentages represent completed installation milestones, not image
download bytes: configuration checks, pulling, digest verification, preparing the
replacement, switching, health verification, and cleanup. Pulling stays at 20%
until Docker completes the download. The elapsed timer continues while waiting.

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
