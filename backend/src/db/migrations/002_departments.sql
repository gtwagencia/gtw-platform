-- ================================================================
-- GTW Platform — Migração 002: Departamentos
-- ================================================================

-- ── Departments (grupos de agentes dentro de um workspace) ──────
CREATE TABLE departments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#6366f1',
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_departments_workspace ON departments(workspace_id);

CREATE TRIGGER trg_departments_updated
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Adiciona department_id às memberships de workspace ──────────
ALTER TABLE workspace_memberships
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- ── Adiciona department_id às conversas ─────────────────────────
-- Permite filtrar conversas por departamento
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX idx_conversations_dept ON conversations(department_id) WHERE department_id IS NOT NULL;

-- ── Atualiza índice de conversas para incluir assignee_id ───────
-- (melhora performance do filtro por agente)
CREATE INDEX IF NOT EXISTS idx_conversations_assignee
  ON conversations(workspace_id, assignee_id, status);
