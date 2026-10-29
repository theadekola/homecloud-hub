# SSH identity and storage presentation cleanup

- The shared SSH fingerprint component now owns the identity title and an accessible eye icon on one line. Show/hide retains masking and resets for a changed fingerprint. All SSH forms use this same header. The verification checkbox and its comment share one row, with natural text wrapping on small screens.
- Docker resource host pickers display the Docker host name, without a node/name slash prefix. Option values, offline state and verification before switching are unchanged.
- Proxmox storage inventory omits entries whose configured node assignments exclude the reporting node. It still retains applicable offline or unmeasured registrations and explains their state. The Storage Pools view also excludes old not-assigned rows defensively, so cached/provider data cannot restore the unwanted row. Administrative Configuration remains the cluster registration view.
- Removed the explanatory storage scope section and its redundant TrueNAS link from Storage Overview.
- Renamed the header action to Add TrueNAS and linked it directly to Settings Connections with the existing TrueNAS setup parameter. Provider configuration still enforces its existing access controls.

Validation: full web suite, focused Proxmox storage API suite, TypeScript/Vite production build, and HTTPS browser fixtures at 1440px and 390px. Browser checks cover both SSH pairing dialogs, eye/title and checkbox/comment alignment, plain Docker host names, exclusion of foreign storage, removal of the scope section, and opening the TrueNAS form directly. Mobile SSH popup visually inspected. No live storage configuration or connection was changed.
