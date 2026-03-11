#!/usr/bin/env bash
# =============================================================
# GTW Platform — Deploy no Docker Swarm
#
# Uso:
#   ./deploy.sh setup      — primeira vez: cria secrets, builda, faz deploy
#   ./deploy.sh build      — builda e envia imagens ao registry
#   ./deploy.sh deploy     — (re)deploya o stack
#   ./deploy.sh update     — builda + força atualização dos serviços
#   ./deploy.sh logs [svc] — mostra logs de um serviço
#   ./deploy.sh ps         — lista serviços e réplicas
#   ./deploy.sh rm         — remove o stack (mantém volumes/secrets)
# =============================================================

set -euo pipefail

STACK_NAME="gtw"
COMPOSE_FILE="docker-stack.yml"
REGISTRY="${REGISTRY:-registry.seudominio.com}"
TAG="${TAG:-latest}"

export REGISTRY TAG

# ── Cores ──────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[gtw]${NC} $*"; }
warn()  { echo -e "${YELLOW}[gtw]${NC} $*"; }
error() { echo -e "${RED}[gtw] ERRO:${NC} $*"; exit 1; }

# ── Helpers ────────────────────────────────────────────────
require_swarm() {
  docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -q "active" \
    || error "Este nó não está no Swarm. Execute: docker swarm init"
}

secret_exists() {
  docker secret ls --format '{{.Name}}' | grep -q "^$1$"
}

create_secret_if_missing() {
  local name="$1"
  local prompt="$2"
  if secret_exists "$name"; then
    warn "Secret '$name' já existe — pulando"
  else
    read -rsp "$prompt: " value
    echo
    printf '%s' "$value" | docker secret create "$name" -
    info "Secret '$name' criado"
  fi
}

build_images() {
  info "Buildando imagens..."

  docker build -t "${REGISTRY}/gtw-backend:${TAG}"  ./backend
  docker build -t "${REGISTRY}/gtw-frontend:${TAG}" ./frontend
  docker build -t "${REGISTRY}/gtw-nginx:${TAG}"    ./nginx

  info "Enviando imagens ao registry..."
  docker push "${REGISTRY}/gtw-backend:${TAG}"
  docker push "${REGISTRY}/gtw-frontend:${TAG}"
  docker push "${REGISTRY}/gtw-nginx:${TAG}"
}

# ── Comandos ───────────────────────────────────────────────
cmd_setup() {
  require_swarm

  info "=== Setup inicial do GTW Platform ==="

  # Secrets
  info "Criando secrets..."
  create_secret_if_missing "db_password"  "Senha do banco de dados"
  create_secret_if_missing "jwt_secret"   "JWT secret (mínimo 64 chars)"

  # SSL
  if secret_exists "ssl_cert"; then
    warn "Secrets SSL já existem — pulando"
  else
    echo
    warn "Informe o caminho dos certificados SSL (ou pressione Enter para usar self-signed)"
    read -rp "Caminho do certificado (.crt/.pem) [Enter = auto-gerar]: " cert_path
    read -rp "Caminho da chave privada (.key)    [Enter = auto-gerar]: " key_path

    if [[ -z "$cert_path" ]]; then
      info "Gerando certificado self-signed..."
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /tmp/gtw_ssl.key \
        -out    /tmp/gtw_ssl.crt \
        -subj   "/C=BR/ST=SP/L=SaoPaulo/O=GTW/CN=localhost" 2>/dev/null
      cert_path="/tmp/gtw_ssl.crt"
      key_path="/tmp/gtw_ssl.key"
      warn "Usando certificado self-signed (não recomendado para produção)"
    fi

    docker secret create ssl_cert "$cert_path"
    docker secret create ssl_key  "$key_path"
    info "Secrets SSL criados"
  fi

  build_images
  cmd_deploy
}

cmd_build() {
  build_images
}

cmd_deploy() {
  require_swarm
  info "Deployando stack '${STACK_NAME}'..."
  docker stack deploy -c "$COMPOSE_FILE" --with-registry-auth "$STACK_NAME"
  info "Stack deployado. Acompanhe: ./deploy.sh ps"
}

cmd_update() {
  build_images
  cmd_deploy
  info "Forçando atualização dos serviços..."
  docker service update --force "${STACK_NAME}_backend"
  docker service update --force "${STACK_NAME}_frontend"
  docker service update --force "${STACK_NAME}_nginx"
}

cmd_logs() {
  local svc="${1:-backend}"
  docker service logs -f --tail 100 "${STACK_NAME}_${svc}"
}

cmd_ps() {
  docker stack ps "$STACK_NAME" --no-trunc
  echo
  docker stack services "$STACK_NAME"
}

cmd_rm() {
  warn "Isso vai remover o stack '${STACK_NAME}' (volumes e secrets são mantidos)."
  read -rp "Confirmar? [s/N]: " confirm
  [[ "$confirm" =~ ^[sS]$ ]] || { info "Cancelado."; exit 0; }
  docker stack rm "$STACK_NAME"
  info "Stack removido."
}

cmd_migrate() {
  info "Rodando migrations no serviço backend..."
  local container
  container=$(docker ps --filter "name=${STACK_NAME}_backend" -q | head -1)
  [[ -n "$container" ]] || error "Nenhum container backend encontrado. O stack está rodando?"
  docker exec "$container" node src/db/migrate.js
}

# ── Dispatcher ─────────────────────────────────────────────
case "${1:-help}" in
  setup)   cmd_setup   ;;
  build)   cmd_build   ;;
  deploy)  cmd_deploy  ;;
  update)  cmd_update  ;;
  logs)    cmd_logs "${2:-backend}" ;;
  ps)      cmd_ps      ;;
  rm)      cmd_rm      ;;
  migrate) cmd_migrate ;;
  *)
    echo "Uso: $0 {setup|build|deploy|update|logs [svc]|ps|rm|migrate}"
    exit 1
    ;;
esac
