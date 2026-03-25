# ── Stage 1: dependencies ──────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

# ── Stage 2: production ────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeuser -u 1001 && \
    apk add --no-cache su-exec

WORKDIR /app

COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules
COPY --chown=nodeuser:nodejs . .

RUN rm -f .env.* && chmod +x docker-entrypoint.sh && \
    mkdir -p /app/uploads && chown nodeuser:nodejs /app/uploads

# Entrypoint roda como root para corrigir permissões do volume montado

EXPOSE 4000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
