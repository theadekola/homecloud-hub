#!/usr/bin/env python3
"""Migrate managed LAN installations to HTTPS without changing credentials."""
import ipaddress
import os
from pathlib import Path
from urllib.parse import urlsplit


def configure(path):
    original = path.read_text()
    values = dict(line.split("=", 1) for line in original.splitlines() if "=" in line and not line.lstrip().startswith("#"))
    origin = urlsplit(values.get("WEB_ORIGIN", ""))
    host = origin.hostname
    if not host:
        raise ValueError("WEB_ORIGIN must contain the installation address")
    try:
        local = ipaddress.ip_address(host).is_private
    except ValueError:
        local = host == "localhost" or host.endswith(".local")
    # Public domains retain their ACME settings and chosen port.
    if not local:
        return False
    replacements = {"DOMAIN": "https://" + host, "WEB_PORT": "6003", "HTTPS_PORT": "6002", "WEB_ORIGIN": "https://" + host + ":6002", "CADDY_DEFAULT_SNI": host, "CADDY_TLS": "tls internal"}
    lines = [line for line in original.splitlines() if line.split("=", 1)[0] not in replacements]
    lines.extend(key + "=" + value for key, value in replacements.items())
    updated = "\n".join(lines) + "\n"
    if original == updated:
        return False
    backup = path.with_name(".env.before-https-6002")
    if not backup.exists():
        backup.write_text(original)
        os.chmod(backup, 0o600)
    temporary = path.with_name(".env.https-tmp")
    temporary.write_text(updated)
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    return True

if __name__ == "__main__":
    configure(Path(".env"))
