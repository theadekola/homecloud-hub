# Theme surface correction, 27 October 2026

The selected palette previously reached only an explicit list of shared controls. The notification dropdown, unread items and several page-specific styles still used fixed navy/blue colours. Components using legacy `--surface`, `--text`, `--muted`, `--border` and `--input-bg` variables also fell back to their original colours because those variables were never bound to the saved palette.

The correction connects those aliases to shared theme variables and migrates fixed decorative surface, border, text, highlight and focus colours in the main workspace, settings, connection panels, topology, Docker update dialogs, pagination and related styles. The notification panel has explicit final palette rules for Light and Dark modes. Login controls now use the saved palette, and chart tooltip/axis/grid chrome follows the interface palette.

Warning/error indicators, service status colours, distinct chart data series, terminal colours and original product/provider artwork retain their meaning or identity. Layout, APIs and user data are unchanged.

Validation: all 574 frontend tests passed, including three new stylesheet regression tests for notification surfaces and severity indicators, legacy token aliases/light surfaces, and login palette inheritance. The TypeScript/Vite production build passed and `git diff --check` passed. Automated checks cover styles and state; visual checks on the user's running VM and real mobile browsers remain to be done. A local visual-test attempt could not run because this environment has no Chromium executable.
