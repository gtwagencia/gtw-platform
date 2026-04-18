-- GTW Platform — Migração 012: Adiciona contact_name nos tickets

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS contact_name TEXT;
