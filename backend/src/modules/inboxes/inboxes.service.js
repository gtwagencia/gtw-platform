'use strict';

const { query } = require('../../config/database');

async function list(workspaceId) {
  const r = await query(
    `SELECT i.*,
            COUNT(DISTINCT c.id)::int AS conversation_count
     FROM inboxes i
     LEFT JOIN conversations c ON c.inbox_id = i.id
     WHERE i.workspace_id = $1
     GROUP BY i.id
     ORDER BY i.name`,
    [workspaceId]
  );
  return r.rows;
}

async function getById(inboxId, workspaceId) {
  const r = await query(
    'SELECT * FROM inboxes WHERE id = $1 AND workspace_id = $2',
    [inboxId, workspaceId]
  );
  return r.rows[0] || null;
}

async function create(workspaceId, body) {
  const {
    name, channelType, phoneNumber,
    evolutionApiUrl, evolutionApiKey, evolutionInstance,
  } = body;

  const r = await query(
    `INSERT INTO inboxes
       (workspace_id, name, channel_type, phone_number,
        evolution_api_url, evolution_api_key, evolution_instance,
        webhook_secret)
     VALUES ($1,$2,$3,$4,$5,$6,$7, encode(gen_random_bytes(32),'hex')) RETURNING *`,
    [workspaceId, name, channelType || 'whatsapp_evolution',
      phoneNumber || null, evolutionApiUrl || null,
      evolutionApiKey || null, evolutionInstance || null]
  );
  return r.rows[0];
}

async function update(inboxId, workspaceId, body) {
  const map = {
    name:              'name',
    phoneNumber:       'phone_number',
    isActive:          'is_active',
    evolutionApiUrl:   'evolution_api_url',
    evolutionApiKey:   'evolution_api_key',
    evolutionInstance: 'evolution_instance',
    connectionStatus:  'connection_status',
    qrCode:            'qr_code',
    autoAssign:        'auto_assign',
    chatbotEnabled:    'chatbot_enabled',
    chatbotPrompt:     'chatbot_prompt',
    groupsEnabled:     'groups_enabled',
  };

  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  vals.push(inboxId, workspaceId);
  const r = await query(
    `UPDATE inboxes SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Inbox não encontrado'), { status: 404 });
  return r.rows[0];
}

async function remove(inboxId, workspaceId) {
  const r = await query(
    'DELETE FROM inboxes WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [inboxId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Inbox não encontrado'), { status: 404 });
}

// ── Inbox Memberships ──────────────────────────────────────────────────────

async function listMembers(inboxId, workspaceId) {
  const r = await query(
    `SELECT im.user_id, im.created_at AS joined_at,
            u.name, u.email, u.avatar_url,
            wm.role AS workspace_role
     FROM inbox_memberships im
     JOIN users u ON u.id = im.user_id
     LEFT JOIN workspace_memberships wm ON wm.user_id = im.user_id AND wm.workspace_id = $2
     WHERE im.inbox_id = $1
     ORDER BY u.name`,
    [inboxId, workspaceId]
  );
  return r.rows;
}

async function addMember(inboxId, userId, workspaceId) {
  // Verifica que o usuário é membro do workspace
  const check = await query(
    'SELECT 1 FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  );
  if (!check.rows.length) throw Object.assign(new Error('Usuário não é membro deste workspace'), { status: 400 });

  await query(
    'INSERT INTO inbox_memberships (inbox_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [inboxId, userId]
  );
  const r = await query(
    `SELECT im.user_id, u.name, u.email, u.avatar_url
     FROM inbox_memberships im JOIN users u ON u.id = im.user_id
     WHERE im.inbox_id = $1 AND im.user_id = $2`,
    [inboxId, userId]
  );
  return r.rows[0];
}

async function removeMember(inboxId, userId) {
  await query(
    'DELETE FROM inbox_memberships WHERE inbox_id = $1 AND user_id = $2',
    [inboxId, userId]
  );
}

// Retorna os inbox_ids vinculados a um usuário num workspace
async function getUserInboxIds(userId, workspaceId) {
  const r = await query(
    `SELECT im.inbox_id
     FROM inbox_memberships im
     JOIN inboxes i ON i.id = im.inbox_id
     WHERE im.user_id = $1 AND i.workspace_id = $2`,
    [userId, workspaceId]
  );
  return r.rows.map(row => row.inbox_id);
}

module.exports = { list, getById, create, update, remove, listMembers, addMember, removeMember, getUserInboxIds };
