-- GTW Platform — Migração 015: Membership de agentes por inbox
-- Permite vincular um agente a um ou mais inboxes específicos.
-- Quando um agente tem pelo menos 1 vínculo, ele só enxerga conversas
-- dos inboxes a que pertence (+ conversas atribuídas diretamente a ele).
-- Agentes sem nenhum vínculo mantêm o comportamento anterior
-- (veem conversas atribuídas a eles + não atribuídas do workspace).

CREATE TABLE IF NOT EXISTS inbox_memberships (
  inbox_id   UUID NOT NULL REFERENCES inboxes(id)  ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (inbox_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_memberships_user ON inbox_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_memberships_inbox ON inbox_memberships(inbox_id);
