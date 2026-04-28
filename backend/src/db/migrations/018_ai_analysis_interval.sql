-- Intervalo mínimo entre análises de IA por workspace (em minutos)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS ai_analysis_interval_minutes INT NOT NULL DEFAULT 60;
