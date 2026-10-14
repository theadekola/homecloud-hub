# Connection onboarding

Owners open **Settings → Connections → Add Connection**. Shortcuts on Proxmox and Docker open the same flow. An empty Overview offers **Add Your First Connection**. Other roles can use permitted resource pages but cannot add, edit or revoke credentials.

## Proxmox Node

Test and save the Proxmox API connection using the existing token, CA and permission controls. HomeCloud supports one active API connection. Saving replaces that connection and verifies resource access first; a successful test does not grant management permissions.

Pair each Proxmox node for Docker guest discovery. The root installer requires qm, pct, Python 3, curl and systemd. Its outbound HTTPS connector discovers running guests without exposing their Docker API ports. The pairing code expires after ten minutes and can be consumed once. Existing connectors remain compatible. Display names are separate from the node hostname used by guest setup.

Choose a discovered Docker host and Connect. Install & Connect remains available for supported guests; missing guest-agent access uses the verified SSH workflow. A required full shutdown/start remains a manual action, followed by Recheck Setup. See docs-guest-agent-install-connect.md.

## Docker Host

Name the connection, generate its code, and run the displayed installer on the intended Linux Docker server. It requires Python 3, curl and systemd. Existing Docker must respond on /var/run/docker.sock. If Docker is absent on Debian/Ubuntu, the installer asks for INSTALL before installing docker.io and starting the service. Existing nonresponsive Docker or Podman requires manual review. Other operating systems require Docker to be installed manually.

Enter the HomeCloud HTTPS origin and code at the installer prompts. The code is passed to Python over standard input, rather than through process arguments. Private CA deployments require the host trust store to trust the issuing certificate. TLS verification stays enabled. No Docker TCP listener is created, no whole OS upgrade is performed, and no guest power operation occurs.

The connector uses the same root service and configuration paths as the Proxmox connector. It refuses to overwrite an existing connector. Its stored type limits discovery and execution to the local Docker Engine; the server rejects guest reports from standalone connectors.

Click **Verify & Connect** after installation. HomeCloud resolves the connector associated with that exact pairing code, checks its online report, then requests /info from that exact Engine. Failed verification does not change the selected host. Successful verification opens the Docker dashboard. If the code has expired after successful installation, use the saved connection card's Test and Manage controls.

## Advanced: Direct Docker API

Use an already configured Docker HTTPS endpoint with trusted CA and client certificates. Test Connection checks the proposed endpoint. Save & Connect also checks the Engine before encrypting credentials. One direct endpoint is supported. Pairing does not require a direct endpoint; unconfigured direct endpoints no longer appear as errors in host selectors.

## Connection cards and removal

Cards show the connection method, connector availability or verification status, and relevant Test, Manage, Edit and Remove controls. Connector availability is distinct from successful Engine verification. Proxmox API and direct Engine tests are read-only. Credentials are never returned with connection metadata.

Remove revokes a connector token or removes a saved API connection; it does not delete a VM, container or Docker resource, nor stop a host service. Uninstall connector services separately on their hosts. Removing a selected connector leaves that selection unavailable, rather than switching silently to a different Engine. Environment-defined endpoints cannot be removed through the saved-connection controls. Removing a saved override may reveal an environment-defined endpoint.

## Verification scope

Regression tests cover typed, single-use pairing and expiry, owner permissions, hashed tokens, standalone guest restrictions, fixed installer transports, explicit package-install consent, refusal to overwrite a connector, read-only checks, exact-host verification, failed-selection preservation and removal without fallback. Python tests verify that standalone scanning does not call qm/pct. Rendered React tests exercise the connection choices and HTTPS gate. Shell syntax and Python bridge tests run in GitHub CI.

No existing live hosts, VMs or containers were modified during development. A real first installation should be checked on a disposable supported Docker host before wider rollout; fixtures do not establish compatibility with every distribution or Docker installation.
