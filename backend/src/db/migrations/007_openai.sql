-- Migration 007: OpenAI support + ai_provider preference
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS openai_api_key  TEXT,
  ADD COLUMN IF NOT EXISTS ai_provider     VARCHAR(20) DEFAULT 'anthropic';
