-- GTW Platform — Migração 011: Módulo de Tickets (Trello-like)

-- ── Feature toggle no workspace ───────────────────────────────────────────────
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS tickets_enabled BOOLEAN NOT NULL DEFAULT false;

-- ── Boards (painéis) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_boards (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  color        TEXT        NOT NULL DEFAULT '#6366f1',
  is_archived  BOOLEAN     NOT NULL DEFAULT false,
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_boards_workspace ON ticket_boards(workspace_id) WHERE NOT is_archived;
CREATE TRIGGER trg_ticket_boards_updated BEFORE UPDATE ON ticket_boards FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Board members ─────────────────────────────────────────────────────────────
-- role: viewer (read-only), member (can create/edit tickets), manager (configure columns + members)
CREATE TABLE IF NOT EXISTS ticket_board_members (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id   UUID        NOT NULL REFERENCES ticket_boards(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_board_members_board ON ticket_board_members(board_id);
CREATE INDEX IF NOT EXISTS idx_ticket_board_members_user  ON ticket_board_members(user_id);

-- ── Columns (listas/estágios) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_columns (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id   UUID        NOT NULL REFERENCES ticket_boards(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#6366f1',
  position   INTEGER     NOT NULL DEFAULT 0,
  is_done    BOOLEAN     NOT NULL DEFAULT false,  -- coluna de resolução (para medir tempo)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_columns_board ON ticket_columns(board_id, position);

-- ── Ticket labels (workspace-level) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_labels (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  color        TEXT        NOT NULL DEFAULT '#6366f1',
  UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_ticket_labels_workspace ON ticket_labels(workspace_id);

-- ── Tickets ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id        UUID        NOT NULL REFERENCES ticket_boards(id) ON DELETE CASCADE,
  column_id       UUID        NOT NULL REFERENCES ticket_columns(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT,
  assignee_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  priority        TEXT        NOT NULL DEFAULT 'medium',  -- low, medium, high, urgent
  due_date        TIMESTAMPTZ,
  position        INTEGER     NOT NULL DEFAULT 0,
  estimated_hours NUMERIC(6,2),
  -- Link para conversa WhatsApp
  conversation_id UUID        REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id      UUID        REFERENCES contacts(id)      ON DELETE SET NULL,
  -- Recorrência
  is_recurring          BOOLEAN     NOT NULL DEFAULT false,
  recurrence_type       TEXT,       -- daily, weekly, biweekly, monthly, yearly, custom
  recurrence_interval   INTEGER,    -- para custom: a cada N dias
  recurrence_end        TIMESTAMPTZ,
  parent_ticket_id      UUID        REFERENCES tickets(id) ON DELETE SET NULL,
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_board       ON tickets(board_id, position);
CREATE INDEX IF NOT EXISTS idx_tickets_column      ON tickets(column_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee    ON tickets(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_due_date    ON tickets(due_date)    WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_conversation ON tickets(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_recurring   ON tickets(is_recurring, recurrence_end) WHERE is_recurring = true;
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Ticket ↔ Labels ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_ticket_labels (
  ticket_id UUID NOT NULL REFERENCES tickets(id)        ON DELETE CASCADE,
  label_id  UUID NOT NULL REFERENCES ticket_labels(id)  ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, label_id)
);

-- ── Time logs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_time_logs (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id        UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER,   -- preenchido ao parar ou ao inserir manual
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_time_logs_ticket ON ticket_time_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_time_logs_user   ON ticket_time_logs(user_id);

-- ── Reminders ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_reminders (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id  UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  remind_at  TIMESTAMPTZ NOT NULL,
  message    TEXT,
  sent       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_reminders_remind_at ON ticket_reminders(remind_at) WHERE NOT sent;
