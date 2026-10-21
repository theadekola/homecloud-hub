Developer attribution: **The Adekola** · Company attribution: **ATT-Tech**. Updated 20 October 2026.

# Terms of use for the self-hosted application

Effective date: 16 October 2026.

## Licence and scope

i-Clusters's application source is provided under the [MIT License](LICENSE). That licence governs permission to use, copy, modify, distribute and sell copies of the software, including its copyright-notice requirements and warranty/liability disclaimer. This document explains operational responsibilities; it does not add licence restrictions or replace the MIT License. Third-party dependencies and artwork retain their respective licences and notices. The application licence does not imply endorsement or grant rights in third-party trademarks.

## Your installation

i-Clusters is self-hosted software. The project does not include a managed hosting service, guaranteed uptime, guaranteed recovery, a support response deadline or an individual service-level agreement. A separately operated hosted service may have its own terms, privacy notice and commercial agreement.

The installation operator is responsible for authorizing users, protecting the controller and provider credentials, choosing provider permissions, maintaining backups, installing updates, configuring network/TLS access and following applicable obligations. Users should act only on infrastructure they are authorized to manage.

## Privileged operations

i-Clusters can submit operations that stop services, change infrastructure, delete resources or affect data. Read the selected target and confirmation carefully. A reported queued task is not a guarantee of completion. Provider/API failures, missing measurements and incomplete inventories must be investigated before relying on them. Test recovery on disposable resources and keep independent backups.

AI assistance is read-only and can be inaccurate. Review its suggestions before making changes through other controls. Monitoring and security status displays do not certify security or guarantee detection of every outage or threat.

## External services and charges

You choose and provide access to connected providers, notification channels and AI services. Their availability, terms, permissions and charges are separate from i-Clusters. Tests can send real notifications and AI tests can be billable. See [privacy and data handling](PRIVACY.md) for the information sent by configured features.

## Support and reporting

Use the [repository issue tracker](https://github.com/theadekola/homecloud-hub/issues) for non-sensitive reproducible problems or feature requests. Do not include credentials or private infrastructure data. For security vulnerabilities, follow [SECURITY.md](SECURITY.md). No specific response time is promised.

## Release candidates

The 3.1.0 release-candidate series is for evaluation. Publication is currently paused pending fixes and final acceptance; see the release policy for the current candidate. Paid support, hosting, response targets and recovery guarantees require a separate agreement from the actual service operator. The project does not assert a company registration status, statutory compliance certification or universal provider compatibility. Review [release policy](docs/release-policy.md) and complete [acceptance checks](docs/acceptance-checklist.md) before customer production use.
