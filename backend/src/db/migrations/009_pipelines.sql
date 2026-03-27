-- GTW Platform — Migração 009: Multi-Pipeline Kanban

-- Pipelines table
CREATE TABLE IF NOT EXISTS pipelines (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT,
  is_default   BOOLEAN     NOT NULL DEFAULT false,
  position     INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_workspace ON pipelines(workspace_id, position);
CREATE TRIGGER trg_pipelines_updated BEFORE UPDATE ON pipelines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pipeline ↔ Inbox (many-to-many)
CREATE TABLE IF NOT EXISTS pipeline_inboxes (
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  inbox_id    UUID NOT NULL REFERENCES inboxes(id)   ON DELETE CASCADE,
  PRIMARY KEY (pipeline_id, inbox_id)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_inboxes_inbox ON pipeline_inboxes(inbox_id);

-- Pipeline ↔ Department (many-to-many)
CREATE TABLE IF NOT EXISTS pipeline_departments (
  pipeline_id   UUID NOT NULL REFERENCES pipelines(id)   ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  PRIMARY KEY (pipeline_id, department_id)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_departments_dept ON pipeline_departments(department_id);

-- Add pipeline_id and ai_prompt to kanban_stages
ALTER TABLE kanban_stages
  ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ai_prompt   TEXT;

CREATE INDEX IF NOT EXISTS idx_kanban_stages_pipeline ON kanban_stages(pipeline_id) WHERE pipeline_id IS NOT NULL;

-- Add pipeline_id to deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id, workspace_id) WHERE pipeline_id IS NOT NULL;

-- Seed: migrate existing stages and deals into a default pipeline per workspace
DO $$
DECLARE
  ws RECORD;
  new_pipeline_id UUID;
BEGIN
  FOR ws IN
    SELECT DISTINCT workspace_id FROM kanban_stages WHERE pipeline_id IS NULL
  LOOP
    INSERT INTO pipelines (workspace_id, name, is_default, position)
    VALUES (ws.workspace_id, 'Vendas', true, 0)
    RETURNING id INTO new_pipeline_id;

    UPDATE kanban_stages SET pipeline_id = new_pipeline_id
    WHERE workspace_id = ws.workspace_id AND pipeline_id IS NULL;

    UPDATE deals SET pipeline_id = new_pipeline_id
    WHERE workspace_id = ws.workspace_id AND pipeline_id IS NULL;
  END LOOP;
END $$;
