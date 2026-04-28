-- Detalhes do anúncio Meta enriquecidos via Marketing API
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS meta_ad_id        TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_name      TEXT,
  ADD COLUMN IF NOT EXISTS meta_adset_name   TEXT,
  ADD COLUMN IF NOT EXISTS meta_campaign_name TEXT;
