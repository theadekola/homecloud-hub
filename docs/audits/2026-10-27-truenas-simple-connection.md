# TrueNAS connection certificate follow-up

New TrueNAS connections require the HTTPS endpoint, API key and protocol, with no CA upload. The default accepts self-signed HTTPS certificates. Optional verification and a private CA input are grouped under collapsed Advanced certificate settings. Existing CA-based configurations retain verification unless explicitly changed.

A shared TrueNAS TLS policy applies to single-request sockets and authenticated report batches for both current and legacy protocols. Verification can use system trust or a configured CA. Accepting self-signed certificates encrypts traffic without verifying server identity. No global Node TLS settings are changed, and other integrations retain their certificate policies.

Runtime configuration stores the explicit verification choice, validates it, and applies it without restart. Password masking, encrypted API key storage, owner authorization, draft testing and explicit saves remain unchanged. The production guide documents the default and optional verified environment settings.

Validation includes local HTTPS/WebSocket protocol fixtures for self-signed connections without a CA, explicit verification rejecting untrusted certificates and hostname mismatches before sending the API key, configuration persistence and legacy CA migration, and UI Test/Save requests with advanced options collapsed. Full API/web regression tests and the production build are run before merging. No live customer TrueNAS system or physical mobile browser was used.
