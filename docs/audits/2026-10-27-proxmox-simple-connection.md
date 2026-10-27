# Proxmox connection and popup follow-up

New connections default to accepting self-signed HTTPS certificates without a CA upload. Certificate verification and an optional private CA remain available under collapsed Advanced certificate settings. Existing saved verification choices are preserved. A blank CA input retains the saved CA only for the same host and port; changing the endpoint does not inherit that trust.

Permission setup uses the saved connection TLS policy for temporary administrator authentication and ACL changes. HTTPS remains mandatory, owner authorization, explicit selected-guest consent, connection binding, credential clearing, permission preservation, and verification remain enforced. Accepting self-signed certificates encrypts traffic but does not verify server identity.

Shared popup headers, including configuration dialogs, scroll in the popup instead of sticking over form inputs. Focus trapping and background scroll locking are unchanged.

Monitoring requires PVEAuditor read access. Guest start/shutdown/reboot additionally requires VM.PowerMgmt at the selected /vms/ID paths. Privilege-separated tokens need effective permission on both the user and token. A limited monitoring token cannot grant itself power access; setup requests a temporary Proxmox administrator only when permissions are missing. Other management features can require additional privileges.

Validation: targeted API fixtures include real local self-signed HTTPS connection and permission repair, verified TLS rejecting an untrusted certificate, and saved-CA endpoint scoping. UI fixtures exercise the default connection form and power setup with self-signed mode. Full API/web tests and production build are run before publication. No live customer cluster power actions or mobile browser rendering were tested.
