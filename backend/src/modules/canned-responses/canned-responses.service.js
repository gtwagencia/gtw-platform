'use strict';

const { query } = require('../../config/database');

async function list(workspaceId, search) {
  const params = [workspaceId];
  let cond = '';
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    cond = `AND (LOWER(shortcut) LIKE $${params.length} OR LOWER(content) LIKE $${params.length})`;
  }

  const r = await query(
    `SELECT cr.*, u.name AS created_by_name
     FROM canned_responses cr
     LEFT JOIN users u ON u.id = cr.created_by
     WHERE cr.workspace_id = $1 ${cond}
     ORDER BY cr.shortcut`,
    params
  );
  return r.rows;
}

async function create(workspaceId, { shortcut, content }, userId) {
  const r = await query(
    `INSERT INTO canned_responses (workspace_id, shortcut, content, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [workspaceId, shortcut.toLowerCase().trim(), content, userId]
  );
  return r.rows[0];
}

async function update(id, workspaceId, { shortcut, content }) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  if (shortcut !== undefined) { fields.push(`shortcut = $${idx++}`); vals.push(shortcut.toLowerCase().trim()); }
  if (content  !== undefined) { fields.push(`content = $${idx++}`);  vals.push(content); }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo'), { status: 400 });

  fields.push(`updated_at = NOW()`);
  vals.push(id, workspaceId);

  const r = await query(
    `UPDATE canned_responses SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Resposta não encontrada'), { status: 404 });
  return r.rows[0];
}

async function remove(id, workspaceId) {
  const r = await query(
    'DELETE FROM canned_responses WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [id, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Resposta não encontrada'), { status: 404 });
}

module.exports = { list, create, update, remove };
