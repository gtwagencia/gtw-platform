-- GTW Platform — Migração 013: Suporte a grupos WhatsApp e ai_ignore_groups

-- Habilita recepção de mensagens de grupos por inbox (padrão: desabilitado)
ALTER TABLE inboxes ADD COLUMN IF NOT EXISTS groups_enabled BOOLEAN DEFAULT false;

-- Marca conversas de grupo
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_group    BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS group_jid   TEXT;

-- Armazena quem falou em cada mensagem de grupo (JID do participante)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_jid  TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Workspace: IA ignora grupos
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ai_ignore_groups BOOLEAN DEFAULT true;
