'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../../config/database');

const SALT_ROUNDS       = 12;
const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = 30; // days

// ── Token helpers ──────────────────────────────────────────────────────────

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, isSuperAdmin: user.is_super_admin },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

async function createRefreshToken(userId) {
  const raw  = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const exp  = new Date(Date.now() + REFRESH_TOKEN_TTL * 86400 * 1000);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, exp]
  );
  return raw;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getUserWithOrgs(userId) {
  const userRes = await query(
    'SELECT id, name, email, avatar_url, is_super_admin, is_active FROM users WHERE id = $1',
    [userId]
  );
  if (!userRes.rows.length) return null;
  const user = userRes.rows[0];

  const orgsRes = await query(
    `SELECT o.id, o.name, o.slug, o.logo_url, o.plan, om.role
     FROM org_memberships om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = $1 AND o.is_active = true
     ORDER BY o.name`,
    [userId]
  );
  user.orgs = orgsRes.rows;
  return user;
}

// ── Register ───────────────────────────────────────────────────────────────

async function register({ name, email, password, orgName }) {
  // Check duplicate email
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) throw Object.assign(new Error('E-mail já cadastrado'), { status: 409 });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // First user ever becomes super admin
  const countRes = await query('SELECT COUNT(*) FROM users');
  const isSuperAdmin = parseInt(countRes.rows[0].count, 10) === 0;

  // Create user
  const userRes = await query(
    `INSERT INTO users (name, email, password_hash, is_super_admin)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, email.toLowerCase(), passwordHash, isSuperAdmin]
  );
  const user = userRes.rows[0];

  // Create org
  const slug = (orgName || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const slugUnique = `${slug}-${Date.now().toString(36)}`;

  const orgRes = await query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *`,
    [orgName || `${name}'s Org`, slugUnique]
  );
  const org = orgRes.rows[0];

  // Owner membership
  await query(
    'INSERT INTO org_memberships (org_id, user_id, role) VALUES ($1, $2, $3)',
    [org.id, user.id, 'owner']
  );

  const accessToken  = signAccess(user);
  const refreshToken = await createRefreshToken(user.id);
  const fullUser     = await getUserWithOrgs(user.id);

  return { accessToken, refreshToken, user: fullUser };
}

// ── Login ──────────────────────────────────────────────────────────────────

async function login({ email, password }) {
  const res = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = res.rows[0];

  if (!user || !user.is_active) {
    throw Object.assign(new Error('Credenciais inválidas'), { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw Object.assign(new Error('Credenciais inválidas'), { status: 401 });

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const accessToken  = signAccess(user);
  const refreshToken = await createRefreshToken(user.id);
  const fullUser     = await getUserWithOrgs(user.id);

  return { accessToken, refreshToken, user: fullUser };
}

// ── Refresh ────────────────────────────────────────────────────────────────

async function refresh(rawToken) {
  if (!rawToken) throw Object.assign(new Error('Token não fornecido'), { status: 401 });

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const res  = await query(
    `SELECT rt.*, u.id as uid, u.is_super_admin, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [hash]
  );

  const row = res.rows[0];
  if (!row || !row.is_active) throw Object.assign(new Error('Token inválido'), { status: 401 });
  if (new Date(row.expires_at) < new Date()) {
    await query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
    throw Object.assign(new Error('Token expirado'), { status: 401 });
  }

  // Rotate: delete old, issue new
  await query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
  const newRefresh = await createRefreshToken(row.user_id);
  const userRes    = await query('SELECT * FROM users WHERE id = $1', [row.user_id]);
  const accessToken = signAccess(userRes.rows[0]);

  return { accessToken, refreshToken: newRefresh };
}

// ── Logout ─────────────────────────────────────────────────────────────────

async function logout(rawToken) {
  if (!rawToken) return;
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash]);
}

// ── Me ─────────────────────────────────────────────────────────────────────

async function me(userId) {
  const user = await getUserWithOrgs(userId);
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  return user;
}

// ── Change password ────────────────────────────────────────────────────────

async function changePassword(userId, { currentPassword, newPassword }) {
  const res  = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = res.rows[0];

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw Object.assign(new Error('Senha atual incorreta'), { status: 400 });

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

  // Revoke all refresh tokens
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

// ── Update profile ─────────────────────────────────────────────────────────

async function updateProfile(userId, { name, avatarUrl }) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  if (name      !== undefined) { fields.push(`name = $${idx++}`);       vals.push(name); }
  if (avatarUrl !== undefined) { fields.push(`avatar_url = $${idx++}`); vals.push(avatarUrl); }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  vals.push(userId);
  await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
    vals
  );
  return getUserWithOrgs(userId);
}

module.exports = { register, login, refresh, logout, me, changePassword, updateProfile };
