-- GTW Platform — Migração 014: Role tickets_only
-- Permite criar usuários com acesso restrito apenas ao módulo de Tickets,
-- sem acesso ao painel de conversas, contatos, funil ou configurações.

-- O role é validado via CHECK constraint na tabela workspace_memberships.
-- Valores permitidos: admin | agent | member | tickets_only

ALTER TABLE workspace_memberships
  DROP CONSTRAINT IF EXISTS workspace_memberships_role_check;

ALTER TABLE workspace_memberships
  ADD CONSTRAINT workspace_memberships_role_check
  CHECK (role IN ('admin', 'agent', 'member', 'tickets_only'));
