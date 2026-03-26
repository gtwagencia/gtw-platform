'use strict';

const { query }   = require('../../config/database');
const kanbanSvc   = require('../kanban/kanban.service');
const bcrypt      = require('bcrypt');
const crypto      = require('crypto');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

// ── List workspaces ────────────────────────────────────────────────────────

async function listForOrg(orgId, userId, isSuperAdmin, orgRole) {
  if (isSuperAdmin || ['owner', 'admin'].includes(orgRole)) {
    const r = await query(
      `SELECT w.*,
              COUNT(DISTINCT wm.user_id)::int AS member_count,
              COUNT(DISTINCT i.id)::int        AS inbox_count
       FROM workspaces w
       LEFT JOIN workspace_memberships wm ON wm.workspace_id = w.id
       LEFT JOIN inboxes i ON i.workspace_id = w.id
       WHERE w.org_id = $1
       GROUP BY w.id
       ORDER BY w.name`,
      [orgId]
    );
    return r.rows;
  }

  const r = await query(
    `SELECT w.*, wm.role
     FROM workspace_memberships wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE w.org_id = $1 AND wm.user_id = $2 AND w.is_active = true
     ORDER BY w.name`,
    [orgId, userId]
  );
  return r.rows;
}

// ── Create workspace ───────────────────────────────────────────────────────

async function create(orgId, { name, logoUrl, timezone }) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const slugUnique = `${slug}-${Date.now().toString(36)}`;

  const r = await query(
    `INSERT INTO workspaces (org_id, name, slug, logo_url, timezone)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orgId, name, slugUnique, logoUrl || null, timezone || 'America/Sao_Paulo']
  );
  const workspace = r.rows[0];

  await kanbanSvc.seedDefaultStages(workspace.id);

  return workspace;
}

// ── Get single workspace ───────────────────────────────────────────────────

async function getById(workspaceId) {
  const r = await query('SELECT * FROM workspaces WHERE id = $1', [workspaceId]);
  return r.rows[0] || null;
}

// ── Update workspace ───────────────────────────────────────────────────────

async function update(workspaceId, body) {
  const map = {
    name:                 'name',
    logoUrl:              'logo_url',
    timezone:             'timezone',
    isActive:             'is_active',
    metaPixelId:          'meta_pixel_id',
    metaAdAccountId:      'meta_ad_account_id',
    metaAccessToken:      'meta_access_token',
    metaConversionsToken: 'meta_conversions_token',
    businessHours:        'business_hours',
    followUpEnabled:      'follow_up_enabled',
    aiAnalysisEnabled:    'ai_analysis_enabled',
    anthropicApiKey:      'anthropic_api_key',
    openaiApiKey:         'openai_api_key',
    aiProvider:           'ai_provider',
    slaResponseMinutes:   'sla_response_minutes',
  };

  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [jsKey, dbCol] of Object.entries(map)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = $${idx++}`);
      vals.push(body[jsKey]);
    }
  }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  vals.push(workspaceId);
  const r = await query(
    `UPDATE workspaces SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  return r.rows[0];
}

// ── Members ────────────────────────────────────────────────────────────────

async function listMembers(workspaceId) {
  const r = await query(
    `SELECT u.id, u.name, u.email, u.avatar_url, wm.role, wm.created_at AS joined_at
     FROM workspace_memberships wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = $1
     ORDER BY u.name`,
    [workspaceId]
  );
  return r.rows;
}

async function addMember(workspaceId, { email, role, name }) {
  let userRes = await query('SELECT id, name FROM users WHERE email = $1', [email.toLowerCase()]);
  let tempPassword = null;

  if (!userRes.rows.length) {
    // Cria o usuário com senha temporária aleatória
    tempPassword = crypto.randomBytes(6).toString('hex'); // ex: "a3f8c21d4e90"
    const hash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    const userName = name || email.split('@')[0];
    const created = await query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name`,
      [userName, email.toLowerCase(), hash]
    );
    userRes = { rows: [created.rows[0]] };
  }

  const userId = userRes.rows[0].id;
  await query(
    `INSERT INTO workspace_memberships (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [workspaceId, userId, role || 'agent']
  );

  return {
    user_id:       userId,
    name:          userRes.rows[0].name,
    email:         email.toLowerCase(),
    role:          role || 'agent',
    temp_password: tempPassword, // null se o usuário já existia
  };
}

async function removeMember(workspaceId, userId) {
  await query(
    'DELETE FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  );
}

async function updateMemberRole(workspaceId, userId, role) {
  const r = await query(
    `UPDATE workspace_memberships SET role = $1 WHERE workspace_id = $2 AND user_id = $3 RETURNING *`,
    [role, workspaceId, userId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Membro não encontrado'), { status: 404 });
  return r.rows[0];
}

module.exports = {
  listForOrg, create, getById, update,
  listMembers, addMember, removeMember, updateMemberRole,
};
