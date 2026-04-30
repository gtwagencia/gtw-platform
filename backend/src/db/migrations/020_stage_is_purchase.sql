-- Flag para identificar etapa de compra (dispara evento Purchase no Meta CAPI)
ALTER TABLE kanban_stages
  ADD COLUMN IF NOT EXISTS is_purchase BOOLEAN NOT NULL DEFAULT false;
