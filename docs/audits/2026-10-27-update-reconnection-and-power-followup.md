# Update reconnection and guest power follow-up, 27 October 2026

## Software updates

Header update controls now render only for an available release or an active installation. Background polling still discovers releases; manual checking remains available in Settings > About. Completion removes the header control when no release remains available.

A shared, tab-scoped, bounded update marker is set when an installation is requested or observed. During a known update, expected proxy/network interruption receives: “i-Clusters is updating. The server is restarting and will reconnect automatically.” App displays a status banner noting that retained readings may be out of date. Report hooks retain their last data without displaying expected restart failures as page errors. Authentication, permission and explicit application errors are not suppressed, and the update marker expires instead of hiding unrelated outages indefinitely. Failed or completed jobs clear update state. Mutations are not automatically retried.

## VM and CT power actions

The supplied screenshot shows SSH authentication rejection, before a Proxmox lifecycle call. No missing VM/CT power endpoint was reproduced. Real local SSH-server fixtures and HTTP provider fixtures now cover start as well as shutdown/reboot for both guest types. Start requires the node SSH approval grant; shutdown/reboot also require the matching confirmation. Requests reach the exact qemu/lxc status endpoint and one-time grants remain bound to the selected action.

The popup and login failure now explain that the credentials must identify a Linux SSH account on the displayed Proxmox node. An i-Clusters login or a Proxmox @pve account does not automatically create a Linux account; root@pam normally uses SSH username root. This guidance does not bypass authentication or establish whether the screenshot's account exists or is allowed on the user's node.

Validation: 511 backend tests and 579 frontend tests passed, including update-header visibility, completion, friendly restart errors, unchanged ordinary errors, update-state expiry, and the App status banner. The production web build passed. Actual SSH access and guest power on the user's private installation remain unverified. To isolate the rejection, test the same username directly with `ssh USER@NODE_IP` from a machine that can reach the node; a successful connection must also have root or working sudo privileges.
