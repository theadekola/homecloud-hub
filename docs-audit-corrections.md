# i-Clusters audit corrections

This change addresses the implementation findings from the 14 October 2026 audit. It changes repository code only; validation uses local fixtures and rendered React components, without operating a live cluster.

| Finding | Result |
| --- | --- |
| F1: stopped guest actions require guest SSH | VM/CT actions request fresh root authentication on the containing Proxmox node. Grants remain bound to the user, method, path and exact body, single-use and short-lived. Guest placement/type is rechecked before the provider write. |
| F2: CT credential/bootstrap gap | Create CT requires an initial console/root password, discovers node-specific templates, and revalidates template/root storage and reported capacity before allocating a fresh ID. It creates a stopped unprivileged CT with automatic startup disabled. |
| F3: unsupported 30-day reports | Task history accepts the offered periods through 720 hours. The existing 500-task-per-node bound and truncation diagnostics remain. A 30-day choice is not a guarantee that the provider retained complete history. |
| F4: cross-node restore validation | Local sources stay on the source node. Cross-node restore requires storage configured as shared, active backup storage and the exact archive visible on the destination. Destination storage must support the guest type. Existing IDs and force overwrite remain prohibited. |
| F5: missing VM controls | Snapshot and Backup buttons open the selected VM's existing forms with operator/busy-state gates. |
| F6: invalid backup combinations | Forms filter backup storage and guest suggestions by selected node, resetting dependent inputs. Immediate and scheduled backups revalidate active backup storage and guest placement in the API. |
| F7: stale resource details | Path changes clear displayed data/error/loading state immediately. Late responses are ignored. CT detail components are also keyed by node and guest ID. |
| F8: missing Docker guest setup | Owner-visible setup candidates offer Install & Connect through the existing confirmation-required setup endpoint. Installation status/errors are displayed; after agent discovery the owner can connect to the new Engine. |
| F9: viewer log access | Container Logs is a read control; viewer/auditor access no longer requires management privileges. Power actions remain operator-gated. |
| F10: outdated navigation/guidance | The removed VPN route is no longer linked from Proxmox Settings. Notifications link to existing delivery diagnostics and describe server-side configuration. |
| F11: silent agent revocation failures | Revocation has busy protection and visible success/failure feedback. |

Related corrections retain the selected archive in Restore navigation, refresh both monitoring reads from a forced sample, apply the monitoring period to Docker charts, include paired Docker fleet context in AI queries, record explicit notification tests without automatically retrying them, and reject new disk allocation on raw iSCSI targets.

## Validation

- API tests cover stopped VM/CT lifecycle, grant binding/replay, wrong-node/type rejection, backup selection, local/shared restore sources, destination content, existing IDs, task periods, CT credentials/storage/templates and notification-test history.
- Rendered React tests use jsdom and actual React hooks/components to exercise VM forms, CT password and dependent fields, viewer log access, owner setup, revocation failures, backup node selection and stale/late resource reads.
- Production TypeScript/Vite build, Python node-agent tests, updater tests and HTTPS configuration tests are run separately.
- No root password is returned in CT creation results or recorded in successful action audit details. Guest SSH access still depends on the guest SSH server and its login policy; provisioning a console password does not override that policy.

## Deployment checks still needed

The node SSH server must be reachable and permit the chosen root authentication policy. VM first boot, OS installation, CT SSH policy, real provider writes and backup restore outcomes require checks on new disposable resources after deployment. Test external notifications only when explicitly requested. Intentional limitations such as Compose-file deployment, authoritative DNS and application two-factor login remain outside these corrections.
