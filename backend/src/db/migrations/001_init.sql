-- ================================================================
-- GTW Platform — Schema inicial
-- Multi-org → Multi-workspace → Inboxes (N WhatsApps) → Conversas
-- ================================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------
-- ORGANIZATIONS (agências/empresas que usam a plataforma)
-- ----------------------------------------------------------------
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  logo_url      TEXT,
  plan          TEXT NOT NULL DEFAULT 'starter', -- starter, pro, enterprise
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- USERS (globais — vinculados a orgs via memberships)
-- ----------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  avatar_url      TEXT,
  is_super_admin  BOOLEAN NOT NULL DEFAULT false, -- acesso total à plataforma
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- ORG MEMBERSHIPS (usuário ↔ organização)
-- role: owner | admin | member
-- ----------------------------------------------------------------
CREATE TABLE org_memberships (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- ----------------------------------------------------------------
-- WORKSPACES (empresas clientes dentro de uma org)
-- ----------------------------------------------------------------
CREATE TABLE workspaces (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  logo_url       TEXT,
  timezone       TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  -- Meta Ads
  meta_pixel_id          TEXT,
  meta_ad_account_id     TEXT,
  meta_access_token      TEXT,
  meta_conversions_token TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

-- ----------------------------------------------------------------
-- WORKSPACE MEMBERSHIPS (usuário ↔ workspace)
-- role: admin | agent | viewer
-- ----------------------------------------------------------------
CREATE TABLE workspace_memberships (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'agent',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- ----------------------------------------------------------------
-- INBOXES (canais de atendimento — cada WhatsApp é um inbox)
-- channel_type: whatsapp_evolution | whatsapp_official | instagram | facebook
-- ----------------------------------------------------------------
CREATE TABLE inboxes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  channel_type          TEXT NOT NULL DEFAULT 'whatsapp_evolution',
  phone_number          TEXT,
  -- Evolution API config
  evolution_api_url     TEXT,
  evolution_api_key     TEXT,
  evolution_instance    TEXT,
  -- Status da conexão
  connection_status     TEXT NOT NULL DEFAULT 'disconnected', -- connected | disconnected | connecting
  qr_code               TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- CONTACTS
-- ----------------------------------------------------------------
CREATE TABLE contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  avatar_url    TEXT,
  -- Meta Ads tracking
  meta_lead_id          TEXT,
  meta_campaign_id      TEXT,
  meta_adset_id         TEXT,
  meta_ad_id            TEXT,
  meta_form_id          TEXT,
  utm_source            TEXT,
  utm_campaign          TEXT,
  utm_medium            TEXT,
  -- CRM
  tags          TEXT[] DEFAULT '{}',
  notes         TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, phone)
);

-- ----------------------------------------------------------------
-- KANBAN STAGES (colunas do funil)
-- ----------------------------------------------------------------
CREATE TABLE kanban_stages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#6366f1',
  position      INTEGER NOT NULL DEFAULT 0,
  is_default    BOOLEAN NOT NULL DEFAULT false, -- stage inicial dos novos leads
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- DEALS (cards do kanban)
-- ----------------------------------------------------------------
CREATE TABLE deals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  stage_id      UUID NOT NULL REFERENCES kanban_stages(id),
  assignee_id   UUID REFERENCES users(id),
  title         TEXT NOT NULL,
  value         NUMERIC(12,2) DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'BRL',
  priority      TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
  lost_reason   TEXT,
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- CONVERSATIONS
-- ----------------------------------------------------------------
CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inbox_id          UUID NOT NULL REFERENCES inboxes(id),
  contact_id        UUID NOT NULL REFERENCES contacts(id),
  deal_id           UUID REFERENCES deals(id),
  assignee_id       UUID REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'open', -- open | resolved | pending | snoozed
  -- WhatsApp remote JID
  remote_jid        TEXT NOT NULL,
  -- Última mensagem (cache)
  last_message_at   TIMESTAMPTZ,
  last_message_text TEXT,
  unread_count      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(inbox_id, remote_jid)
);

-- ----------------------------------------------------------------
-- MESSAGES
-- ----------------------------------------------------------------
CREATE TABLE messages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction           TEXT NOT NULL, -- inbound | outbound
  message_type        TEXT NOT NULL DEFAULT 'text', -- text | image | audio | video | document | sticker | location | template
  content             TEXT,
  media_url           TEXT,
  media_mime_type     TEXT,
  -- Evolution API IDs
  evolution_msg_id    TEXT UNIQUE,
  -- Status (outbound)
  status              TEXT NOT NULL DEFAULT 'sent', -- sent | delivered | read | failed
  -- IA
  ai_analyzed         BOOLEAN NOT NULL DEFAULT false,
  ai_intent           TEXT, -- greeting | question | purchase | complaint | other
  ai_purchase_data    JSONB, -- { product, quantity, value } se identificou compra
  -- Quem enviou (se outbound via painel)
  sender_id           UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- REFRESH TOKENS
-- ----------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- META CONVERSION EVENTS (log de eventos enviados à Conversions API)
-- ----------------------------------------------------------------
CREATE TABLE meta_conversion_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id),
  deal_id         UUID REFERENCES deals(id),
  event_name      TEXT NOT NULL, -- Purchase | Lead | CompleteRegistration
  event_value     NUMERIC(12,2),
  currency        TEXT DEFAULT 'BRL',
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
  meta_response   JSONB,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------
CREATE INDEX idx_messages_conversation   ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id, status, last_message_at DESC);
CREATE INDEX idx_contacts_workspace      ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone          ON contacts(workspace_id, phone);
CREATE INDEX idx_deals_stage             ON deals(stage_id, workspace_id);
CREATE INDEX idx_deals_contact           ON deals(contact_id);
CREATE INDEX idx_inboxes_workspace       ON inboxes(workspace_id);

-- ----------------------------------------------------------------
-- TRIGGERS: updated_at automático
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated  BEFORE UPDATE ON organizations  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated          BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_workspaces_updated     BEFORE UPDATE ON workspaces     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_inboxes_updated        BEFORE UPDATE ON inboxes        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_contacts_updated       BEFORE UPDATE ON contacts       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_conversations_updated  BEFORE UPDATE ON conversations  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_deals_updated          BEFORE UPDATE ON deals          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
