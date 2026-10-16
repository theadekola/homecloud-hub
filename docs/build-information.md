# Build information

Settings → About shows the API package version, build number, UTC build date and optional source revision. `/api/settings` supplies these fields under `system` after authentication. `/api/health` reports the package version without exposing credentials.

The API build writes `apps/api/src/build-info.json`. This generated file is ignored by Git and copied/generated inside the API image. Its values remain fixed across process restarts. Running source without a generated file reports development/unembedded metadata rather than inventing a build time.

Standard Ubuntu install and `sudo homecloud update` source `deployment/build-env.sh` immediately before building. It supplies the checked-out Git revision and current UTC time automatically. The host updater invokes that same update command. No manual environment-file edits are needed.

The default build number is the UTC build timestamp in `YYYYMMDDHHmmss` format, followed by the first 12 revision characters when available. It is a build identifier, not a sequential release counter. The semantic application version is separate.

Plain `docker compose build` still generates a timestamp and number inside the API image, but does not automatically have the parent checkout's Git revision. Builders can pass these optional environment values to Compose or equivalent Docker build arguments:

| Variable | Meaning |
| --- | --- |
| `HOMECLOUD_BUILD_DATE` | Valid timestamp, normalized to UTC |
| `HOMECLOUD_BUILD_REVISION` | Git hexadecimal revision, 7–40 characters |
| `HOMECLOUD_BUILD_NUMBER` | Optional identifier, 1–100 letters, digits, `.`, `_`, `+` or `-` |

For an identified manual build:

```sh
source deployment/build-env.sh
docker compose build
```

For development, `npm run build` includes API metadata generation. Build metadata does not contain secrets or the build machine's username/path. Invalid generated metadata falls back to development labels. Invalid build arguments fail generation instead of claiming a successful identified build.
