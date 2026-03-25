#!/bin/sh
# Lê Docker Secrets e os exporta como variáveis de ambiente
set -e

# db_password → DATABASE_URL
if [ -f /run/secrets/db_password ]; then
  DB_PASS=$(cat /run/secrets/db_password)
  export DATABASE_URL="postgresql://postgres:${DB_PASS}@postgres:5432/gtw_platform"
fi

# jwt_secret
if [ -f /run/secrets/jwt_secret ]; then
  export JWT_SECRET=$(cat /run/secrets/jwt_secret)
fi

# Corrige permissões do volume de uploads (montado como root pelo Docker)
mkdir -p "${UPLOAD_DIR:-/app/uploads}"
chown -R nodeuser:nodejs "${UPLOAD_DIR:-/app/uploads}" 2>/dev/null || true

# Roda migrations automaticamente na inicialização
echo "[entrypoint] Rodando migrations..."
su-exec nodeuser node src/db/migrate.js

exec su-exec nodeuser "$@"
