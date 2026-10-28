# Connect Proxmox in one save

Sign in to Proxmox as an administrator and create one user and one API token. Use the Proxmox VE authentication server (`pve`) realm. The user and its privilege-separated token each need their own PVEAdmin permission entry.

1. Open **Datacenter → Permissions → Users → Add**. Create an enabled user such as `iclusters` in **Proxmox VE authentication server (pve)**.
2. Open **Datacenter → Permissions → Add → User Permission**. Set Path `/`, User `iclusters@pve`, Role **PVEAdmin**, and enable **Propagate**.
3. Open **Datacenter → Permissions → API Tokens → Add**. Choose that user and a token name such as `hub`. Keep **Privilege Separation** enabled. Ensure the token is unexpired. Copy the full token ID and secret immediately; the secret is displayed only once.
4. Open **Datacenter → Permissions → Add → API Token Permission**. Set Path `/`, Token `iclusters@pve!hub`, Role **PVEAdmin**, and enable **Propagate**.
5. In i-Clusters, enter the cluster name, Proxmox hostname/IP without a URL or port, API port (normally `8006`), full token ID and secret. Click **Save**.

These are two permission assignments, not two users or two tokens. Save verifies inherited cluster management and the effective permissions of visible nodes, VMs and CTs before replacing the connection. It enables the existing management flows and starts loading cluster inventory. Missing permissions stay in the same form with instructions; a failed check preserves the previous connection. There is no follow-up power-access popup or second administrator login.

PVEAdmin supports VM/CT power and configuration but does not grant Proxmox ACL administration or node shutdown. More-specific permission restrictions can still limit a guest. Guest OS information needs a QEMU Guest Agent, and Docker hosts require their separate connector or Engine connection. A `pve` account is not a Linux SSH account. Existing action approvals remain in effect.

New connections accept self-signed HTTPS certificates. Editing retains the existing verification policy and retains a saved CA only for the same host and port. Secrets are encrypted on the server and are never returned to the browser; re-enter the token secret when editing.

Reference: [Proxmox user management and API tokens](https://pve.proxmox.com/pve-docs/pveum.1.html).
