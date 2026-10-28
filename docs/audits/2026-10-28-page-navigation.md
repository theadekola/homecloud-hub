# Page paths and Settings titles

Every authenticated page now has one shared, accessible page path above its heading. Overview remains without a path. Paths follow the active route tab, include the selected Docker host, and include Connections sub-sections. Parent segments link back to their section. Unknown tab values use the same defaults as the page; Proxmox creation actions and restricted user-management roles resolve to the page actually displayed.

Settings headings now identify their category: General Settings, System Settings, Security Settings, Connections, Appearance Settings and About i-Clusters. Existing individual page path labels were removed to avoid duplicates. Mobile paths wrap within the viewport.

Validation:

- 601 web tests passed, including seven navigation regression tests.
- Production TypeScript and Vite build passed.
- Fixture browser audit passed 94 desktop/mobile layouts and four dialogs.
- Additional audit passed 26 desktop/mobile layouts and four dialogs, including remaining resource tabs, Settings titles, live tab changes, parent navigation and Docker host changes.
- Desktop and mobile Settings screenshots inspected.
- Whitespace checks passed.

Checks used fixture APIs, not the user's running infrastructure. No provider management operations were performed.
