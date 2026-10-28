#!/bin/sh
# Export only Caddy's public local root, never its private key, for SSH connector bootstrap.
set -eu
mkdir -p secrets/ca
if [ -f .env ] && grep -q '^CADDY_TLS=tls internal' .env; then
 temporary=$(mktemp secrets/ca/.controller-ca.XXXXXX)
 trap 'rm -f "$temporary"' EXIT
 docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > "$temporary"
 openssl x509 -in "$temporary" -noout >/dev/null
 chmod 644 "$temporary"
 mv "$temporary" secrets/ca/controller-ca.pem
else
 rm -f secrets/ca/controller-ca.pem
fi
