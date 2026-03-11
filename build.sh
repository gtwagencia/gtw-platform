#!/bin/bash
# =============================================================
# build.sh — Builda as imagens Docker no servidor
# Execute via SSH no servidor antes de subir a stack no Portainer
#
# Uso: bash build.sh
# =============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== GTW Platform — Build das Imagens ==="
echo ""

echo "▶ Buildando backend..."
docker build -t gtw-backend:latest ./backend
echo "✓ Backend pronto"
echo ""

echo "▶ Buildando frontend..."
DOMAIN="${DOMAIN:-app.gtw.digital}"
docker build \
  --build-arg NEXT_PUBLIC_API_URL="https://${DOMAIN}/api/v1" \
  -t gtw-frontend:latest ./frontend
echo "✓ Frontend pronto"
echo ""

echo "✅ Imagens buildadas com sucesso!"
echo ""
echo "Imagens disponíveis:"
docker images | grep gtw
echo ""
echo "Próximo passo: suba a stack pelo Portainer usando o docker-compose.yml"
echo "Não esqueça de configurar as variáveis de ambiente no Portainer:"
echo "  DOMAIN     = app.gtw.digital"
echo "  DB_PASSWORD = (senha forte)"
echo "  JWT_SECRET  = (string aleatória longa)"
