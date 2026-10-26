#!/usr/bin/env bash
# Source from the checked-out repository immediately before a production build.
export ICLUSTERS_BUILD_REVISION="$(git rev-parse --verify HEAD 2>/dev/null || true)"
export ICLUSTERS_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
