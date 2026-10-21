# Release and maintenance policy

Developer: The Adekola · Company: ATT-Tech.

Versions follow a `major.minor.patch` scheme with prerelease suffixes for evaluation builds. The current candidate is **3.1.0-rc.3**. Package versions, lockfile root versions, build metadata and notes must agree. Build numbers and Git revisions identify artifacts separately from the semantic version.

## Release gate

**Publication is paused** until the remaining fixes and final acceptance testing are complete. CI validation and evidence collection remain enabled; the release job is explicitly disabled. No new release notes, version bumps, tags or release assets are generated during this pause. Existing published releases are preserved. Re-enabling publication requires a separate reviewed change.

When publication is re-enabled, a main-branch push publishes a GitHub prerelease only after the complete CI check job succeeds and the corresponding version tag does not already exist. The workflow creates the tag at the tested commit, includes release notes and attaches available component inventories, image identities, scan reports and checksums. Existing releases/tags are never moved by this workflow. The repository must permit its scoped Actions token to create releases; a permissions failure is a failed publication, not a published release.

CI rejects test/build/deployment/restore failures, high-severity npm advisory failures and fixable HIGH/CRITICAL container vulnerabilities. Container reports retain unfixed findings for review; the gate is not a claim of no vulnerabilities. Scanner database availability is required. Do not bypass a failing gate silently. Record justified risk decisions before a broader release. An SBOM and checksum are not signatures; signed image distribution and independent verification are not supplied by this source-build workflow.

Candidates remain prereleases until the acceptance checklist, supported-version records, recovery targets, independent security review and customer operating arrangements are complete. General availability requires a separately reviewed release decision; changing a version number is insufficient. No LTS/backport or response-time commitment is implied. A paid agreement may define its own support scope.

## Installation channels

The default installer/update service tracks its configured Git branch, commonly main. Tracking main can include changes after a published candidate. For reproducible evaluation, download and inspect `install.sh` from the chosen version tag and pass the same `--ref` to installation. Verify the tag and release checksum from a trusted source. Pinning source does not make container builds bit-for-bit reproducible: base tags remain mutable and the evidence records tested image identities. Pinning a tag leaves a detached checkout; `homecloud update` intentionally refuses to advance it. Select the next reviewed tag/branch explicitly on the controller before updating. Never force-push a release tag.

Keep a verified encrypted off-host controller backup, preserve original encryption keys and finish active Docker operations before maintenance. The new upgrade rollback protects the consistent local controller state but does not reverse operations already submitted to providers or data migrations in their applications. See the [recovery guide](../deployment/SECURITY-AND-RECOVERY.md).
