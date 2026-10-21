# Customer acceptance record

Version: 3.1.0-rc.2 · Developer: The Adekola · Company: ATT-Tech.

Copy this checklist into a private customer record. Do not commit customer addresses, credentials, archives or raw logs. Default status is **not yet verified**; a box may be checked only with dated evidence.

| Check | Required evidence | Status |
| --- | --- | --- |
| Deployed identity | Exact source revision, controller version, connector versions, host/Compose versions and customer scope | Not yet verified |
| Access | Trusted HTTPS; owner MFA enrollment/recovery; denied roles; logout and device revocation | Not yet verified |
| Providers | Exact Proxmox/Docker/TrueNAS releases; read and permitted write actions on disposable targets; least-privilege failures | Not yet verified |
| Fresh backups | Actual successful jobs from every in-scope node; destination capacity/retention; excluded guests recorded | Not yet verified |
| Guest restore | Restore fresh archive to unused isolated guest ID; boot, inspect representative data and application behavior | Not yet verified |
| Controller recovery | Encrypted off-host archive restored on isolated controller; MFA login, saved configuration decryption, audit/history and connector behavior | Not yet verified |
| Interrupted update | Disconnect browser/network and restart controller at pull, preparation, stop, rename and replacement stages; exclusive recovery and no duplicate mutation | Not yet verified |
| Software rollback | Real failed-image and migration rollback drill on disposable deployment, including failed-rollback handling | Not yet verified |
| Notifications | Actual failure and recovery delivery to each enabled channel; acknowledgment badge behavior | Not yet verified |
| Devices/accessibility | Real iOS Safari, Android and supported desktop browsers; keyboard/screen reader, zoom, navigation and permission-denied wake locks | Not yet verified |
| Load/soak | Intended hosts/containers/users, concurrency, duration, latency percentiles, timeout behavior, memory/disk growth | Not yet verified |
| Security | Review scan reports including unfixed findings; independent authenticated assessment; resolved findings | Not yet verified |
| Operations | Named contacts, maintenance windows, incident process, agreed RPO/RTO, retention/key custody and customer terms | Not yet verified |

CI exercises a separate empty-provider controller, authentication, encrypted restore and bounded concurrent read probes. It does not fill in this customer record. General-availability approval must identify who accepted the evidence and when.
