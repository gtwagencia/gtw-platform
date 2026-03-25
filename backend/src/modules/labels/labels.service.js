'use strict';

const { query } = require('../../config/database');

async function list(workspaceId) {
  const r = await query(
    'SELECT * FROM labels WHERE workspace_id = $1 ORDER BY name',
    [workspaceId]
  );
  return r.rows;
}

async function create(workspaceId, { name, color }) {
  const r = await query(
    `INSERT INTO labels (workspace_id, name, color)
     VALUES ($1, $2, $3) RETURNING *`,
    [workspaceId, name, color || '#6366f1']
  );
  return r.rows[0];
}

async function update(id, workspaceId, { name, color }) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  if (name  !== undefined) { fields.push(`name = $${idx++}`);  vals.push(name); }
  if (color !== undefined) { fields.push(`color = $${idx++}`); vals.push(color); }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo'), { status: 400 });

  vals.push(id, workspaceId);
  const r = await query(
    `UPDATE labels SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Etiqueta não encontrada'), { status: 404 });
  return r.rows[0];
}

async function remove(id, workspaceId) {
  await query('DELETE FROM labels WHERE id = $1 AND workspace_id = $2', [id, workspaceId]);
}

// ── Conversation label management ─────────────────────────────────────────

async function getForConversation(conversationId) {
  const r = await query(
    `SELECT l.* FROM labels l
     JOIN conversation_labels cl ON cl.label_id = l.id
     WHERE cl.conversation_id = $1
     ORDER BY l.name`,
    [conversationId]
  );
  return r.rows;
}

async function addToConversation(conversationId, labelId) {
  await query(
    `INSERT INTO conversation_labels (conversation_id, label_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [conversationId, labelId]
  );
}

async function removeFromConversation(conversationId, labelId) {
  await query(
    'DELETE FROM conversation_labels WHERE conversation_id = $1 AND label_id = $2',
    [conversationId, labelId]
  );
}

module.exports = { list, create, update, remove, getForConversation, addToConversation, removeFromConversation };
