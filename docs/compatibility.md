# Compatibility and deployment scope

Applies to 3.1.0-rc.3. Developer: The Adekola; company: ATT-Tech.

| Component | Tested or implemented scope | Acceptance boundary |
| --- | --- | --- |
| Controller runtime | Node.js 24; PostgreSQL 17; Linux Docker/Compose deployment; Caddy 2.11.7 HTTPS with patched x/net and go-jose dependencies; compiled React frontend | CI uses an isolated Ubuntu runner. Customer Ubuntu/kernel/Engine/Compose versions must be recorded and checked. |
| Proxmox VE | API-token inventory and supported VM/LXC, storage, backup, restore, task and network routes; paired Linux node connector | Protocol fixtures do not certify every VE minor release, token ACL or guest OS. Record exact versions and execute disposable-resource acceptance. |
| Docker | Paired Linux hosts/eligible Linux Proxmox guests or authenticated direct Engine API; image updates for supported lifecycle/configuration | Shared namespaces/lifecycle dependencies, local-only images and digest-pinned tag checks have explicit restrictions. Compose file deployment and coordinated stack migration are not supplied. |
| TrueNAS | HTTPS JSON-RPC integration for 25.04+ method families, with method-dependent compatibility | Exact SCALE releases, credentials, certificate trust and each enabled write operation require live acceptance. No universal compatibility claim. |
| Guest setup | UI offers supported Debian/Ubuntu Linux flows; VM paths need guest agent or verified SSH bootstrap | No Windows Docker provisioning. Do not run generic setup in appliances such as TrueNAS. |
| Browsers | Responsive web interface; automated DOM/UI tests and wake-lock lifecycle simulations | Physical Safari/iOS, Android and desktop accessibility/performance checks remain open until recorded. Wake locks are best effort. |
| Notifications | Nine configured external channel adapters and local activity | Test the actual configured destination and outage/recovery delivery. Queuing is not proof of delivery. |
| Deployment tenancy | One controller, database and API process per customer | User roles are installation-wide. No shared SaaS tenant isolation or horizontal multi-writer journal coordination. |

There is no advertised maximum fleet size or concurrent-user guarantee yet. Complete a measured soak at the intended fleet size before agreeing capacity or availability targets. Unsupported integrations must not be advertised based on a screenshot or a successful TCP connection.
