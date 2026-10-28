# Workspace layout review

## Findings and changes

At a 1280px desktop viewport with the sidebar expanded, the dashboard still chose three widget columns. The middle health panel assigned only 29px to each health label after reserving the gauge, progress bar and percentage widths. Labels broke into several short fragments and increased the height of the entire row. Quick actions similarly retained two columns inside a narrow widget.

Dashboard widgets now choose columns from the available workspace width with a 340px preferred minimum, bounded by the actual container width. The gauge and health readings can move to separate rows. Health labels retain at least 100px, percentages stay together and resource tiles and quick actions use available panel width. This also covers browser zoom and sidebar changes without relying only on viewport breakpoints.

Shared action labels wrap at spaces. Widget headings can move their links or controls to another row. Status badges remain intact. Tabs retain their complete labels in a horizontally scrollable strip, and the users and monitoring table wrappers retain local horizontal scrolling. No provider operation, API permission or authentication flow changes.

## Coverage

Rendered review covers 47 pages/sections at 1280px, 768px and 390px: Dashboard; Proxmox overview, nodes, VMs, CTs, storage and tasks; Docker containers, images, volumes, networks, compose, events and updates; Storage pools, disks, datasets, snapshots, shares and performance; Network map, interfaces, devices, routing, DNS and traffic; Backups, restore points, schedules, retention, destinations and reports; Monitoring; Alerts, history and rules; AI; Users and audit; all six Settings categories; Shell and SFTP.

The browser audit checks document overflow, controls outside their viewport, ordinary words breaking across lines in health and quick-action labels, and runtime errors. Dashboard customization and Docker SSH approval dialogs are opened and closed at each width. Additional dashboard/dialog checks cover 320px, 1536px and 1920px. Fixture APIs supply representative inventories and empty or unavailable sections. No real provider action is submitted.

The initial broad browser run exposed invalid fixture payloads for image updates, security policy, shares and performance. Those fixtures were corrected to match their endpoint shapes before the final assertion run. These were audit fixture errors, not evidence of corresponding live API failures.

## Validation

- 589 web tests pass.
- Production TypeScript/Vite build passes.
- Static audit: 761 button templates across 109 files, no missing-handler or implicit-submit findings.
- Browser regression: 141 page/section layouts and six dialogs across desktop/tablet/phone, plus three additional dashboard layouts and six dialogs at smaller/larger widths.
- Git whitespace check passes.

Run `node apps/web/scripts/audit-layout.mjs` with Playwright and its Chromium installed in the test runtime. Optional `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` variables select existing runtime dependencies. `LAYOUT_WIDTHS` and `LAYOUT_ROUTES` narrow the matrix. The script starts a local Vite server, intercepts API requests with fixtures and closes the browser/server afterward.

This verifies local frontend layout and existing tested control behavior. It does not certify every production dataset, provider integration, browser or live deployment.
