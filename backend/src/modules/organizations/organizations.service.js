'use strict';

const { query } = require('../../config/database');

// ── List orgs for user ─────────────────────────────────────────────────────

async function listForUser(userId, isSuperAdmin) {
  if (isSuperAdmin) {
    const r = await query(
      `SELECT o.*, COUNT(om.user_id)::int AS member_count
       FROM organizations o
       LEFT JOIN org_memberships om ON om.org_id = o.id
       GROUP BY o.id
       ORDER BY o.name`
    );
    return r.rows;
  }

  const r = await query(
    `SELECT o.*, om.role, COUNT(om2.user_id)::int AS member_count
     FROM org_memberships om
     JOIN organizations o ON o.id = om.org_id
     LEFT JOIN org_memberships om2 ON om2.org_id = o.id
     WHERE om.user_id = $1 AND o.is_active = true
     GROUP BY o.id, om.role
     ORDER BY o.name`,
    [userId]
  );
  return r.rows;
}

// ── Get single org ─────────────────────────────────────────────────────────

async function getById(orgId) {
  const r = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
  return r.rows[0] || null;
}

// ── Update org ─────────────────────────────────────────────────────────────

async function update(orgId, { name, logoUrl, plan, isActive }) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  if (name      !== undefined) { fields.push(`name = $${idx++}`);       vals.push(name); }
  if (logoUrl   !== undefined) { fields.push(`logo_url = $${idx++}`);   vals.push(logoUrl); }
  if (plan      !== undefined) { fields.push(`plan = $${idx++}`);       vals.push(plan); }
  if (isActive  !== undefined) { fields.push(`is_active = $${idx++}`);  vals.push(isActive); }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  vals.push(orgId);
  const r = await query(
    `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  return r.rows[0];
}

// ── Members ────────────────────────────────────────────────────────────────

async function listMembers(orgId) {
  const r = await query(
    `SELECT u.id, u.name, u.email, u.avatar_url, u.last_login_at, om.role, om.created_at AS joined_at
     FROM org_memberships om
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = $1
     ORDER BY u.name`,
    [orgId]
  );
  return r.rows;
}

async function inviteMember(orgId, { email, role }) {
  const userRes = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!userRes.rows.length) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  const userId = userRes.rows[0].id;
  const r = await query(
    `INSERT INTO org_memberships (org_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING *`,
    [orgId, userId, role || 'member']
  );
  return r.rows[0];
}

async function removeMember(orgId, userId) {
  // Can't remove last owner
  const ownerRes = await query(
    `SELECT COUNT(*) FROM org_memberships WHERE org_id = $1 AND role = 'owner'`,
    [orgId]
  );
  const memberRes = await query(
    `SELECT role FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  if (!memberRes.rows.length) throw Object.assign(new Error('Membro não encontrado'), { status: 404 });
  if (memberRes.rows[0].role === 'owner' && parseInt(ownerRes.rows[0].count, 10) <= 1) {
    throw Object.assign(new Error('Não é possível remover o único owner'), { status: 400 });
  }

  await query('DELETE FROM org_memberships WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
}

async function updateMemberRole(orgId, userId, role) {
  const r = await query(
    `UPDATE org_memberships SET role = $1 WHERE org_id = $2 AND user_id = $3 RETURNING *`,
    [role, orgId, userId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Membro não encontrado'), { status: 404 });
  return r.rows[0];
}

module.exports = {
  listForUser, getById, update,
  listMembers, inviteMember, removeMember, updateMemberRole,
};
