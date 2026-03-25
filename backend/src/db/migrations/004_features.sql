-- ================================================================
-- GTW Platform — Migração 004: Canned Responses, Labels, Notes,
--                              CSAT, SLA, Auto-assign, Chatbot
-- ================================================================

-- ── Respostas prontas (canned responses) ─────────────────────────
CREATE TABLE IF NOT EXISTS canned_responses (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  shortcut     TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, shortcut)
);

CREATE INDEX IF NOT EXISTS idx_canned_workspace
  ON canned_responses(workspace_id);

-- ── Etiquetas (labels) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labels (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  color        TEXT        NOT NULL DEFAULT '#6366f1',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS conversation_labels (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  label_id        UUID NOT NULL REFERENCES labels(id)        ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_labels_conv
  ON conversation_labels(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_labels_label
  ON conversation_labels(label_id);

-- ── Notas privadas nas mensagens ──────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- ── CSAT, SLA e chatbot nas conversas ────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS csat_rating   INTEGER CHECK (csat_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS csat_comment  TEXT,
  ADD COLUMN IF NOT EXISTS sla_breached  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_active    BOOLEAN NOT NULL DEFAULT false;

-- ── SLA nos workspaces ────────────────────────────────────────────
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS sla_response_minutes INTEGER;

-- ── Auto-assign e chatbot nos inboxes ────────────────────────────
ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS auto_assign      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chatbot_enabled  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chatbot_prompt   TEXT;

-- ── Índice para SLA breach detection ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_sla
  ON conversations(workspace_id, status, first_response_at, created_at)
  WHERE status = 'open' AND sla_breached = false;
