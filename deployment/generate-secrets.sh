#!/bin/sh
set -eu
umask 077
if [ -f .env ]; then
  echo ".env already exists; refusing to overwrite."
  exit 1
fi
cp .env.example .env
jwt="$(openssl rand -hex 48)"
refresh="$(openssl rand -hex 48)"
db="$(openssl rand -hex 32)"
admin="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$jwt|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$refresh|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$db|" .env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://homecloud:$db@postgres:5432/homecloud|" .env
sed -i "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$admin|" .env
chmod 600 .env
echo "Created .env"
echo "Initial admin password: $admin"
echo "Store it securely. It is shown only now."
