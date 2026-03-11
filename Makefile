STACK   = gtw
COMPOSE = docker-stack.yml
REGISTRY ?= registry.seudominio.com
TAG      ?= latest

export REGISTRY TAG

.PHONY: setup build deploy update logs-backend logs-frontend ps rm migrate dev

## Primeira vez no servidor
setup:
	@bash deploy.sh setup

## Apenas builda e envia imagens
build:
	@bash deploy.sh build

## (Re)deploya o stack sem rebuild
deploy:
	@docker stack deploy -c $(COMPOSE) --with-registry-auth $(STACK)

## Build + force update de todos os serviços
update:
	@bash deploy.sh update

## Logs
logs-backend:
	@docker service logs -f --tail 100 $(STACK)_backend
logs-frontend:
	@docker service logs -f --tail 100 $(STACK)_frontend
logs-nginx:
	@docker service logs -f --tail 100 $(STACK)_nginx
logs-db:
	@docker service logs -f --tail 100 $(STACK)_postgres

## Status dos serviços
ps:
	@docker stack ps $(STACK) --no-trunc
	@echo
	@docker stack services $(STACK)

## Migrations manuais
migrate:
	@bash deploy.sh migrate

## Remove o stack (mantém volumes e secrets)
rm:
	@bash deploy.sh rm

## Desenvolvimento local (sem Swarm)
dev:
	@docker-compose up --build
