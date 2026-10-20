# Retain PostgreSQL 17 and its data layout; replace the outdated Go privilege
# helper with Alpine's small su-exec utility for the existing entrypoint only.
FROM postgres:17-alpine
RUN apk upgrade --no-cache \
 && apk add --no-cache su-exec \
 && grep -q 'exec gosu postgres ' /usr/local/bin/docker-entrypoint.sh \
 && sed -i 's/exec gosu postgres /exec su-exec postgres /' /usr/local/bin/docker-entrypoint.sh \
 && ! grep -q gosu /usr/local/bin/docker-entrypoint.sh \
 && rm -f /usr/local/bin/gosu \
 && test "$(su-exec postgres id -u)" = 70
LABEL org.opencontainers.image.authors="The Adekola" org.opencontainers.image.vendor="ATT-Tech"
