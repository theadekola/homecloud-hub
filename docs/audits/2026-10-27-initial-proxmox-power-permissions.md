# Initial Proxmox power permission setup, 27 October 2026

Proxmox connection setup now defaults to “Monitoring and VM / CT power management”. After saving a verified API connection, the owner is taken directly to a power-permission check. Monitoring-only connections remain an explicit option.

The check lists visible VMs and CTs that lack effective `VM.PowerMgmt`. Up to 20 are selected for review per batch. If access is already present, no administrator login or permission write is needed. Otherwise the owner can approve the selection using a temporary Proxmox administrator username/password and optional OTP. The setup uses the configured HTTPS endpoint and trusted CA, applies the privilege to the API user and separated token as required, preserves existing permissions and propagation, then verifies effective token access for every selected guest.

Only `VM.PowerMgmt` is added. Guest-agent command execution, full administration and privileges for unselected or future guests are not added. Protected action SSH approvals remain unchanged. Existing connections can enter the same step through Add / Edit Cluster and Save & Set Up Power Access. New guests may require another batch.

The owner-only setup endpoints are GET/POST `/api/connections/proxmox/power-permissions`. Administrator credentials are not persisted and are cleared from the request before audit logging. Setup requires trusted HTTPS and Proxmox VE 9 or newer, matching the existing permission-repair implementation. Configuration/profile bindings prevent replay against a changed connection or another permission profile. Power and discovery repairs share a process lock.

Validation covers VM/CT selection, user and token ACLs, idempotence, preserving previous privileges, no guest-agent/full-admin escalation, separate power/discovery bindings, owner/HTTPS enforcement, credential clearing, and the initial connection-to-permission-screen flow. Production build and the application test suite were run before publication. Live grants on the user's Proxmox installation have not been performed here.
