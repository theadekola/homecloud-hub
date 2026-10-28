# SSH identity, guest restart and software update popups

## Result

- Every SSH identity verification section places the verification checkbox beside the fingerprint show/hide button, with its label below. Fingerprints remain masked until explicitly revealed. Fingerprint reads show pending feedback.
- Guest setup opens a separate restart dialog only when installation reports that a power cycle is required. Choosing Later performs no power action and preserves the recheck path. Docker VM/CT setup can continue through the same restart dialog when required.
- The explicit shutdown/start action uses the existing authenticated Proxmox action APIs. It checks placement through those APIs, waits for a successful shutdown task and fresh stopped status, starts the selected guest, checks its task and running status, then verifies the exact VM guest agent. CT setup continues into Docker discovery and verification. Unknown power status, missing task receipts and failed tasks stop the flow. There is no forced stop fallback. Retrying verification after a successful start does not repeat the power cycle.
- Modal layers follow opening order rather than DOM order. The SSH approval required by a restart remains above the restart popup and owns the keyboard focus, even when the restart popup is portalled to the document body. Closing is blocked while power work is active.
- The software update icon opens a review popup. Reading the popup does not install anything. It shows installed and available revisions, the last check and available commit summaries. The Update Software button queues installation through the existing owner-only updater API. Progress, reconnection and errors are shown inside this popup, which can be reopened during an update.
- Removed the page-top software update review banner and the page-top updating/restarting message. Ordinary unexpected connection failures still show reconnect feedback. Initial loading and reconnection have a visible pending indicator.
- Shared pending styling adds a rolling indicator to busy action buttons throughout the software, alongside explicit indicators for pairing jobs, discovery, verification, template loading and SSH preparation. Reduced-motion preferences retain a static pending indicator.
- The host updater includes up to 20 bounded Git commit subjects in its atomic JSON status. JSON escaping is handled by Python. A failed or timed-out summary read does not prevent normal updating. Older status files without summaries still display revision and status information.

## Validation

- Web suite: 614 tests passed, including restart sequencing, error handling, missing task receipts, verification retries, explicit update review/install and banner removal.
- App reconnect and approval tests: 4 passed after the final reconnect presentation cleanup.
- API guest bootstrap and software update tests: 14 passed.
- Host updater fixture passed availability, retained-update, quoted commit summaries, installation, requested-check and failure cases.
- Production TypeScript/Vite build passed.
- HTTPS browser fixtures at 1440px and 390px passed both SSH pairing popup types, fingerprint checkbox/button alignment, software update review and explicit install, Proxmox single-save setup, all six AI provider choices, and the complete guest restart flow including the nested SSH approval and actual computed spinner animation.
- Mobile update and restart popups were visually inspected.

All provider calls in these checks used fixtures. No live VM, CT, Docker host or deployed controller was restarted, installed or updated.
