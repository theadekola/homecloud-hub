# Shell toolbar and responsiveness review

The toolbar now has four labelled icon buttons: Copy, Paste, Select All and Enter/Exit Fullscreen. The redundant Disconnect action is removed; closing a session tab still releases its SSH session.

Fullscreen toggles both directions. Where the Fullscreen API is unavailable or denied, the shell expands to the browser viewport. Visual viewport resize/scroll events account for mobile keyboards. Escape or hiding the terminal exits expanded mode. Expansion retains the terminal DOM and SSH session; ResizeObserver refits the terminal and sends its size to the remote PTY.

## Responsiveness and connection findings

- Output is delivered incrementally as NDJSON with proxy buffering disabled, rather than waiting for periodic output polls.
- Typed input and paste use an ordered queue, grouping pending input behind an in-flight request. Uncertain input failures stop transmission without replaying commands.
- UTF-8 fragmentation, input chunking, bounded queues and slow output consumers have regression coverage.
- SSH host fingerprints are checked; sessions are bound to their owner; API roles and active account status are rechecked on output stream renewal. SSH keepalives and session expiry are implemented.
- The real local SSH echo integration test requires each echo to reach HTTP output within one second for node, VM and CT target labels. These labels share a local fixture; this is not testing deployed Proxmox guests.

## Validation limits

UI tests cover icon actions, native fullscreen entry/exit, rejected or missing Fullscreen API, Escape, hiding a tab, mobile viewport changes and retaining the terminal DOM. The browser environment is simulated. Actual iOS/Android browser layout, remote VM latency, throughput under load and Cloudflare/proxy behavior have not been measured in this review. No claim of best-in-class performance or complete security certification is made.
