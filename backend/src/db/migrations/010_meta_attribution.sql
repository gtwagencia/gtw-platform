-- Atribuição de campanha Meta em deals
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS meta_ref       TEXT,         -- ref do Click-to-WhatsApp configurado no anúncio
  ADD COLUMN IF NOT EXISTS meta_ctwa_clid TEXT,         -- Click-to-WhatsApp Click ID (para CAPI fbc)
  ADD COLUMN IF NOT EXISTS meta_source    VARCHAR(20) DEFAULT 'organic'; -- 'paid' | 'organic'
