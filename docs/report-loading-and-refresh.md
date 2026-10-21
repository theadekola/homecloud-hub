# Report loading and refresh controls

Pending report placeholders use a shared rotating circle with an accessible status label. Metric cards omit visible Loading text. The first infrastructure placeholder retains a centered message beneath its circle. Reduced-motion preferences use a static dotted circle. Inline metric/heading indicators are compact; full report placeholders center the indicator. Measured zero remains zero, failed/completed unavailable values do not become endless indicators, and existing measurements remain visible during background refresh.

The source audit inspected 94 refresh-related native controls across 57 page/component files. Every inspected control has a click handler; none is an implicit submit button inside a form. This is source wiring evidence, not a claim that 94 production interactions were executed. Existing page tests and added multi-source refresh tests verify request dispatch without provider mutations.

Corrections:

- A manual refresh during an ordinary/background request queues one server-forced request after that read finishes. Repeated clicks coalesce. Leaving the page cancels the queued refresh. Existing measured values remain visible.
- Docker and TrueNAS provider reads and System information honor explicit refresh requests. The restore view forwards refresh to its TrueNAS snapshot source.
- Storage snapshot refresh bypasses the short report cache.
- Docker inventory, operational readings and recovery-test history have explicit refresh controls.
- Multi-source pages refresh their dependent inventories and reports, preserving the selected resource/host and filters.

Refresh means a read request. Registry update checks, restoring a guest, changing network settings, provider writes and installations remain separate deliberate actions. Provider collection can complete asynchronously; a button click cannot guarantee immediate fresh upstream measurements. Source/API/UI fixtures, production builds and CI gates are checked; real-device latency and live provider acceptance remain separate.
