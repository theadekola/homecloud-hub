# Local image and icon assets

HomeCloud ships its logos in `apps/web/public/assets`. No CDN requests are needed. Standard actions, hardware, status indicators and file operations retain the existing Lucide SVG system.

## OS detection

VM detail logos use QEMU Guest Agent OS ID/name/pretty-name first, then the configured Proxmox OS type. CT details use the reported container OS type. Docker host identity uses its reported OperatingSystem value. Ubuntu and Debian therefore use their actual logos in the OS panels. Generic Linux stays generic; unsupported or missing values use a neutral computer/container icon. Guest names and IP addresses are not OS evidence. No additional per-row API calls are made to obtain logos.

The included OS families are Ubuntu, Debian, Linux, Alpine, Arch, Fedora, Red Hat, CentOS, Rocky Linux, AlmaLinux, openSUSE, FreeBSD, OpenBSD, Android, macOS, Linux Mint, Kali, Raspberry Pi OS, NixOS, Gentoo and Windows.

Docker application logos resolve from known image repository names, including registry prefixes, tags and digests. Unknown or custom images keep a container icon. An image logo does not imply a verified application health state or a new integration capability.

## Identity and accessibility

A shared BrandIcon component controls sizing, local paths and failed-image fallbacks. Logos next to text are decorative to avoid duplicate screen-reader announcements. Standalone marks can provide an accessible label. HomeCloud has an SVG favicon, Apple touch icon and 192/512 pixel application icons. The web manifest provides install metadata; it does not add offline operation.

## Sources

The local `assets/brands/manifest.json` records each SVG source at an immutable upstream commit. `assets/brands/NOTICE.txt` and the included CC0/MIT license texts provide provenance and attribution. About → Credits links to the notice and lists available OS logos.

Feature icons for Dashboard, Storage, Network, Backups, Monitoring, Alerts, Assistant, Shell, SFTP, Users and Settings are original HomeCloud SVG drawings under `public/assets/pages`. Sidebar links and matching page/tab headings share these assets. They remain decorative beside visible text, use fixed dimensions, and fall back to a local outline icon if an image fails. Proxmox and Docker retain their brand logos.
