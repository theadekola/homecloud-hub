# Operating and supporting an installation

Developer: The Adekola · Company: ATT-Tech. This is an operator runbook, not an uptime or recovery guarantee.

## Before accepting a customer

Use a dedicated controller per customer, private network access and trusted HTTPS. Enable MFA for privileged accounts by agreement, use dedicated provider identities and keep SSH host fingerprints independently verified. Record exact provider, connector, guest OS and controller versions. Complete [acceptance](acceptance-checklist.md). Set customer-specific maintenance windows, capacity limits, response contacts, RPO and RTO; none has a default contractual value supplied by this project.

## Routine checks

Inspect controller/container health, provider permissions and connection freshness, backup task completion, destination free space, actual notification delivery and unexplained audit events. Back up the controller outside its host using the encrypted backup tool, with the private age identity held separately. Test fresh guest restores and controller restores at the agreed frequency. A green connection, archive count or writable share is not proof of recoverability.

## Retention and capacity

| Store | Current behavior | Operator action |
| --- | --- | --- |
| Device sessions | Startup removes rows more than 30 days past expiry | Confirm customer retention requirements and database growth. |
| MFA login challenges | Expired challenges cleaned at startup | Restart cleanup is not continuous universal erasure. |
| Refresh tokens, approvals and audit database records | No universal scheduled deletion; audit UI/API exposes latest 500 records | Define reviewed retention/export procedures, back up before database maintenance, and use restricted database export for complete history. Do not assume a UI export is exhaustive. |
| Docker journal | Terminal entries bounded/expired during use; interrupted/running/recovering entries retained and locked | Resolve interrupted operations before maintenance. Treat journal configuration as confidential. |
| Monitoring/notification state | Per-feature bounds; exported files and deliveries can outlive views | Review state size and destination retention. |
| Upgrade recovery points and image tags | Private local files/tags retained | Monitor disk space. Remove only identified old recovery points after an off-host backup and successful acceptance; do not use broad Docker/volume pruning. |
| Encrypted off-host backups | Operator-managed retention | Document expiry, access and key custody. Preserve sufficient copies to meet recovery targets. |

No automated whole-customer erasure or immutable audit service is claimed. Do not invent a legal retention period from this table.

## Incident response

1. Establish the affected controller/customer and whether the symptom is host, provider, storage, authentication or application related. Capture version/revision and sanitized timestamps.
2. Contain the affected access path: restrict network reach; revoke affected sessions/connectors and rotate compromised credentials at the provider. Revoking a controller session does not cancel a provider job already submitted.
3. Preserve relevant database/runtime and host/provider logs with restricted access. Never upload `.env`, private keys, setup keys, recovery codes or full sensitive journals to public issues.
4. Use the recovery guide on an isolated host. Verify identity, restored data and application behavior before returning traffic. Ambiguous Docker recovery must remain locked until inspected.
5. Notify the customer through its agreed channel, record outcome and improve the acceptance/monitoring checks. The operator determines any external reporting duties with appropriate advice.

## Support

Product: https://www.i-clusters.com. Support: https://support.i-clusters.com. If the support site is unavailable, use repository issues for non-sensitive reports and SECURITY.md for vulnerability reporting. These links do not establish a staffed support centre or response SLA. Supply version, exact provider versions, sanitized steps and expected/actual behavior. No telemetry or support bundle is sent automatically by this runbook.
