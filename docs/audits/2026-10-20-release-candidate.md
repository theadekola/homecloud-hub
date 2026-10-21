# Current release-candidate assessment

Baseline: 20 October 2026 · Updated 21 October 2026 · i-Clusters 3.1.0-rc.3 · Developer: The Adekola · Company: ATT-Tech.

This supersedes the earlier same-day source-baseline findings where changes now exist. The release remains a controlled evaluation candidate, pending live installation acceptance and independent security review.

| Earlier finding | Current correction | Remaining boundary |
| --- | --- | --- |
| No self-service MFA/revocation | Authenticator MFA, recovery codes, password change, device sessions and console recovery | Customer enrollment and account-recovery exercise |
| JavaScript-readable browser refresh tokens/no frontend CSP | Secure HttpOnly refresh cookies and frontend CSP | Short access tokens remain script-readable; independent XSS/authenticated review |
| No controller restore tooling | Encrypted consistent backup, offline history, isolated restore and MFA login drill | Customer off-host retention, connector recovery, measured RPO/RTO |
| Process-local Docker tracking | Encrypted durable checkpoints, interrupted locks, exclusive recovery and restart handling | Live crash injection at every destructive stage |
| Concurrent recovery | Exclusive durable recovering state; competing recoveries/installations rejected; release on error; restart returns to interrupted | Single API process only |
| Recovery success insufficiently checked | Original identity/state/policy/network aliases/static addresses verified | Real provider/host network acceptance |
| MFA renewal race | Renewal restricted to the account generation committed by the MFA transaction | Independent account-security review |
| Release/docs/attribution gaps | Synchronized candidate versions, policies, notes, company/developer attribution, CI release publication, SBOM/image reporting | Confirm published assets and actual support arrangements |
| No capacity baseline | Bounded CI concurrent-page read probe and acceptance template | Empty-provider CI is not fleet/load/soak certification |

No production provider resources are changed by this source review. Automated results belong to the specific CI run and commit. A published prerelease is not permission to claim general commercial readiness or shared SaaS tenant isolation.

## Readiness follow-up

Release publication remains paused. The latest Settings corrections passed automated checks; they do not close live customer acceptance gates. The readiness follow-up adds a completeness checker for private acceptance records, a bounded authenticated read probe, and disposable Docker crash-recovery CI evidence. See [commercial acceptance](../commercial-acceptance.md). A successful record check is not an independent security review or proof that referenced evidence is authentic. Historical dated audit findings remain preserved.
