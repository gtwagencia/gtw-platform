'use strict';

const { query } = require('../../config/database');

function buildVisibilityClause(params, { isSuperAdmin, orgRole, workspaceRole, userId }) {
  const isAdmin = isSuperAdmin
    || ['owner', 'admin'].includes(orgRole)
    || workspaceRole === 'admin';

  if (isAdmin) return '';

  params.push(userId);
  return `AND (c.assignee_id = $${params.length} OR c.assignee_id IS NULL)`;
}

async function list(workspaceId, filters = {}, caller = {}) {
  const { status, inboxId, assigneeId, departmentId, contactId, labelId, page = 1, limit = 30 } = filters;
  const offset = (page - 1) * limit;

  const params = [workspaceId];
  const conds  = ['c.workspace_id = $1'];

  if (status)       { params.push(status);       conds.push(`c.status = $${params.length}`); }
  if (inboxId)      { params.push(inboxId);      conds.push(`c.inbox_id = $${params.length}`); }
  if (assigneeId)   { params.push(assigneeId);   conds.push(`c.assignee_id = $${params.length}`); }
  if (departmentId) { params.push(departmentId); conds.push(`c.department_id = $${params.length}`); }
  if (contactId)    { params.push(contactId);    conds.push(`c.contact_id = $${params.length}`); }
  if (labelId)      {
    params.push(labelId);
    conds.push(`EXISTS (SELECT 1 FROM conversation_labels cl WHERE cl.conversation_id = c.id AND cl.label_id = $${params.length})`);
  }

  const where      = 'WHERE ' + conds.join(' AND ');
  const visibility = buildVisibilityClause(params, caller);

  const countRes = await query(
    `SELECT COUNT(*) FROM conversations c ${where} ${visibility}`, params
  );
  const total = parseInt(countRes.rows[0].count, 10);

  params.push(limit, offset);
  const r = await query(
    `SELECT c.*,
            ct.name        AS contact_name,
            ct.phone       AS contact_phone,
            ct.avatar_url  AS contact_avatar,
            i.name         AS inbox_name,
            i.channel_type AS inbox_channel,
            u.name         AS assignee_name,
            u.avatar_url   AS assignee_avatar,
            d.name         AS department_name,
            d.color        AS department_color,
            COALESCE(
              (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
               FROM conversation_labels cl JOIN labels l ON l.id = cl.label_id
               WHERE cl.conversation_id = c.id),
              '[]'
            ) AS labels
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     JOIN inboxes  i  ON i.id  = c.inbox_id
     LEFT JOIN users u ON u.id = c.assignee_id
     LEFT JOIN departments d ON d.id = c.department_id
     ${where} ${visibility}
     ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total, page, limit };
}

async function getById(conversationId, workspaceId, caller = {}) {
  const params = [conversationId, workspaceId];
  const visibility = buildVisibilityClause(params, caller);

  const r = await query(
    `SELECT c.*,
            ct.name AS contact_name, ct.phone AS contact_phone, ct.avatar_url AS contact_avatar,
            i.name AS inbox_name, i.channel_type AS inbox_channel,
            i.evolution_api_url, i.evolution_api_key, i.evolution_instance,
            u.name AS assignee_name, u.avatar_url AS assignee_avatar,
            d.name AS department_name, d.color AS department_color,
            COALESCE(
              (SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color))
               FROM conversation_labels cl JOIN labels l ON l.id = cl.label_id
               WHERE cl.conversation_id = c.id),
              '[]'
            ) AS labels
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     JOIN inboxes  i  ON i.id  = c.inbox_id
     LEFT JOIN users u ON u.id = c.assignee_id
     LEFT JOIN departments d ON d.id = c.department_id
     WHERE c.id = $1 AND c.workspace_id = $2 ${visibility}`,
    params
  );

  if (!r.rows.length) return null;
  return r.rows[0];
}

async function findOrCreate(workspaceId, { inboxId, contactId, remoteJid }) {
  const existing = await query(
    'SELECT * FROM conversations WHERE inbox_id = $1 AND remote_jid = $2',
    [inboxId, remoteJid]
  );
  if (existing.rows.length) return { conversation: existing.rows[0], created: false };

  const inboxRes = await query(
    'SELECT department_id FROM inboxes WHERE id = $1',
    [inboxId]
  );

  const r = await query(
    `INSERT INTO conversations (workspace_id, inbox_id, contact_id, remote_jid, department_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [workspaceId, inboxId, contactId, remoteJid, inboxRes.rows[0]?.department_id || null]
  );
  return { conversation: r.rows[0], created: true };
}

const VALID_STATUSES = new Set(['open', 'pending', 'resolved']);

async function update(conversationId, workspaceId, body) {
  // Validate enum fields
  if (body.status !== undefined && !VALID_STATUSES.has(body.status)) {
    throw Object.assign(new Error(`Status inválido: ${body.status}`), { status: 400 });
  }

  // Validate csat_rating range
  if (body.csatRating !== undefined) {
    const r = parseInt(body.csatRating, 10);
    if (isNaN(r) || r < 1 || r > 5) {
      throw Object.assign(new Error('csatRating deve ser entre 1 e 5'), { status: 400 });
    }
    body.csatRating = r;
  }

  // Validate assigneeId belongs to this workspace
  if (body.assigneeId !== undefined && body.assigneeId !== null) {
    const r = await query(
      'SELECT 1 FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, body.assigneeId]
    );
    if (!r.rows.length) {
      throw Object.assign(new Error('Agente não pertence a este workspace'), { status: 400 });
    }
  }

  // Validate departmentId belongs to this workspace
  if (body.departmentId !== undefined && body.departmentId !== null) {
    const r = await query(
      'SELECT 1 FROM departments WHERE id = $1 AND workspace_id = $2',
      [body.departmentId, workspaceId]
    );
    if (!r.rows.length) {
      throw Object.assign(new Error('Departamento não encontrado neste workspace'), { status: 400 });
    }
  }

  const map = {
    status:       'status',
    assigneeId:   'assignee_id',
    dealId:       'deal_id',
    departmentId: 'department_id',
    csatRating:   'csat_rating',
    csatComment:  'csat_comment',
    slaBreached:  'sla_breached',
    botActive:    'bot_active',
  };

  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [jsKey, dbCol] of Object.entries(map)) {
    if (body[jsKey] !== undefined) {
      fields.push(`${dbCol} = $${idx++}`);
      vals.push(body[jsKey] !== null ? body[jsKey] : null);
    }
  }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  vals.push(conversationId, workspaceId);
  const r = await query(
    `UPDATE conversations SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Conversa não encontrada'), { status: 404 });
  return r.rows[0];
}

async function refreshLastMessage(conversationId) {
  await query(
    `UPDATE conversations c
     SET last_message_at   = m.created_at,
         last_message_text = m.content,
         unread_count      = c.unread_count + 1
     FROM (
       SELECT content, created_at FROM messages
       WHERE conversation_id = $1 AND is_private = false
       ORDER BY created_at DESC LIMIT 1
     ) m
     WHERE c.id = $1`,
    [conversationId]
  );
}

async function markRead(conversationId, workspaceId) {
  await query(
    `UPDATE conversations SET unread_count = 0
     WHERE id = $1 AND workspace_id = $2`,
    [conversationId, workspaceId]
  );
}

module.exports = { list, getById, findOrCreate, update, refreshLastMessage, markRead };
