# Interactive SSH terminal

The Shell page uses the same SSH terminal for Proxmox nodes, VMs and containers. Output is delivered as soon as the SSH channel produces it through an authenticated, uncached HTTP response stream. The previous 1.5-second output polling delay is removed. The stream renews every 15 seconds to recheck account status and roles using the existing access-token and refresh-token flow. Tokens are sent in authorization headers, never in stream URLs.

Keyboard and paste input preserve their order and existing 8,192-character request limit. Input arriving during an outstanding request is grouped into subsequent requests, avoiding a separate queued round trip for every keystroke. An uncertain send failure stops pending input and asks the user to reconnect; commands are never automatically replayed. Password echo remains controlled by the remote SSH terminal.

The existing admin/owner access requirement, session ownership, SSH password authentication and host fingerprint verification remain in place. Streaming does not require additional ports or a new SSH service. Closing a tab releases its output reader and SSH session. Temporary output connection errors retry with bounded backoff; permission errors stop the terminal.

Update both HomeCloud's API and web application, then reopen existing Shell sessions to use streaming. The standard Caddy reverse proxy forwards responses with an unknown content length immediately. A custom reverse proxy must also forward streaming responses without buffering; otherwise it can reintroduce output delay.

Regression tests cover real SSH echo through a local fixture server, HTTP authentication and session ownership, immediate browser output, stream cleanup and renewal, bounded slow-client output, fragmented UTF-8, ordered paste and input failure handling. These tests do not connect to live hosts or execute commands on them. Actual responsiveness still depends on the browser-to-HomeCloud and HomeCloud-to-host network paths.
