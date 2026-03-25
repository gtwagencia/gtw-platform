-- ================================================================
-- GTW Platform — Migração 005: Segurança
-- ================================================================

-- ── Webhook secret por inbox ──────────────────────────────────
-- Cada inbox tem um segredo único. A Evolution API deve ser
-- configurada para enviar este valor no header x-webhook-secret.
ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

-- Gera um webhook_secret para inboxes existentes que não têm
UPDATE inboxes
  SET webhook_secret = encode(gen_random_bytes(32), 'hex')
  WHERE webhook_secret IS NULL;
