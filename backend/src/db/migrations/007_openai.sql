-- Migration 007: OpenAI support + ai_provider + ai_model preference
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS openai_api_key  TEXT,
  ADD COLUMN IF NOT EXISTS ai_provider     VARCHAR(20)  DEFAULT 'anthropic',
  ADD COLUMN IF NOT EXISTS ai_model        VARCHAR(100) DEFAULT NULL;
