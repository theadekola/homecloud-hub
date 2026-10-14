# Shell and SFTP corrections

Shell input is transmitted sequentially in chunks of at most 8,192 JavaScript characters, preserving Unicode surrogate pairs. The API rejects oversized and non-text input with HTTP 400 instead of silently discarding it. A failed chunk stops the current paste; commands may already have been partially sent, so check the terminal before retrying.

Copy and fullscreen check browser support and report errors. Copy may require HTTPS. Paste retains its existing error handling.

Session ownership is retained across React development effect replay and released once after the last mounted owner leaves. Switching an existing tab retains its session; closing a tab or leaving the tools page releases it. Existing server-side session ownership, permissions, fingerprint verification, encrypted saved credentials and expiry remain in place.

SFTP upload retries contain only the failed file and files not yet attempted. Successful files are excluded. Retry retains the original remote destination even if the user browses elsewhere; replacement requires an explicit dialog showing the filenames and destination. Partial uploads remain on the server until replacement or manual removal. File-operation validation and permission errors are shown in the operation dialog.

Browser downloads are limited to 32 MiB. A remote stat checks size and regular-file status before reading. The cumulative limit is checked during transfer too, in case the file grows. Empty reads without EOF stop with an error. Use a dedicated SFTP client for larger transfers. The browser still buffers allowed downloads; this change bounds memory rather than adding streaming.

Validation uses a local SSH/SFTP fixture server, rendered React components, simulated unsupported browser APIs and transfer fixtures. No real infrastructure or remote files are changed. Device-specific clipboard/fullscreen behavior still needs checking on the deployed app.
