-- Atribuição de campanha Meta nas conversas (para exibição no chat)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS meta_ref       TEXT,
  ADD COLUMN IF NOT EXISTS meta_ctwa_clid TEXT,
  ADD COLUMN IF NOT EXISTS meta_source    VARCHAR(20) DEFAULT 'organic';
