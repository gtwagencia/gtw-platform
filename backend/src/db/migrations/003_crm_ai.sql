-- ================================================================
-- GTW Platform — Migração 003: CRM AI + Response Time + Follow-up
-- ================================================================

-- ── Campos de tempo de resposta nas conversas ────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_inbound_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_response_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;

-- ── Configurações de IA e horário comercial nos workspaces ───────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS business_hours      JSONB    DEFAULT '{"enabled":false,"timezone":"America/Sao_Paulo","monday":{"open":"08:00","close":"18:00","enabled":true},"tuesday":{"open":"08:00","close":"18:00","enabled":true},"wednesday":{"open":"08:00","close":"18:00","enabled":true},"thursday":{"open":"08:00","close":"18:00","enabled":true},"friday":{"open":"08:00","close":"18:00","enabled":true},"saturday":{"open":"08:00","close":"12:00","enabled":false},"sunday":{"open":"08:00","close":"12:00","enabled":false}}'::jsonb,
  ADD COLUMN IF NOT EXISTS follow_up_enabled   BOOLEAN  DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_analysis_enabled BOOLEAN  DEFAULT false,
  ADD COLUMN IF NOT EXISTS anthropic_api_key   TEXT;

-- ── Campos de IA nos deals (CRM cards) ──────────────────────────
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS ai_qualification    TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary          TEXT,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversation_id     UUID REFERENCES conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_conversation ON deals(conversation_id) WHERE conversation_id IS NOT NULL;

-- ── Log de follow-ups enviados ───────────────────────────────────
CREATE TABLE IF NOT EXISTS follow_up_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id)    ON DELETE CASCADE,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('30min','1day','3day')),
  message_content TEXT NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error_message   TEXT
);

CREATE INDEX idx_follow_up_logs_conv    ON follow_up_logs(conversation_id);
CREATE INDEX idx_follow_up_logs_ws_sent ON follow_up_logs(workspace_id, sent_at DESC);

-- ── Etapas padrão do Kanban (seed via função) ────────────────────
-- As etapas são criadas quando o workspace é criado (ver workspaces.service.js)
-- Aqui apenas garantimos que a tabela kanban_stages tenha o campo correto
ALTER TABLE kanban_stages
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- ── Índice para conversas recentes sem resposta (para follow-up job) ──
CREATE INDEX IF NOT EXISTS idx_conversations_followup
  ON conversations(workspace_id, status, last_inbound_at)
  WHERE status = 'open' AND last_inbound_at IS NOT NULL;
