-- ================================================================
-- GTW Platform — Migração 006: department_id na tabela inboxes
-- ================================================================

-- Permite associar uma inbox a um departamento específico,
-- usado no auto-assign e criação de conversas.
ALTER TABLE inboxes
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
