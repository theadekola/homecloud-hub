# i-Clusters marketing website

This directory contains the standalone, dependency-free marketing website for [i-Clusters](https://github.com/theadekola/i-clusters). It presents the software as free and open source while accurately describing the current release-candidate status.

## Local preview

From the repository root:

    python3 -m http.server 8080 --directory website

Open http://localhost:8080. The page also works under nested static paths because its stylesheet and script are relative.

## Checks

    node --test website/tests/*.test.mjs

## Deployment

Publish the contents of this directory as the web root of a static hosting service. No Node server, Proxmox connection, credentials or backend API is needed to run the marketing page. The logo PNG is currently loaded from its canonical public GitHub repository asset; internet access is required for that image.

Once DNS and TLS are configured, serve it from https://www.i-clusters.com, which is the product website already referenced by the application. Keep the marketing host isolated from the self-hosted controller and do not expose management API ports.

You can deploy to any static host, for example by placing these files in the document root of a Caddy or Nginx site. For an SPA-style catch-all, no rewrite rule is needed because this is a single regular HTML page.

## Content maintenance

- Current application version: **3.1.0-rc.3**. Release candidate, not general availability.
- Verified product capabilities: [README](../README.md).
- Support boundaries and acceptance: [checklist](../docs/acceptance-checklist.md).
- Licence: [MIT](../LICENSE).
- If release status changes, update the hero version, structured metadata, release notice and these notes.
- Never publish sample infrastructure data as live telemetry, customer endorsements or security certifications.

The interface preview and topology are illustrations, not screenshots or live data.
