'use strict';

const { query } = require('../config/database');

/**
 * Loads org + caller's role into req.org / req.orgRole.
 * Expects :orgId in route params and authenticate() to have run first.
 */
async function orgContext(req, res, next) {
  try {
    const orgId = req.params.orgId;
    if (!orgId) return next();

    if (req.user.isSuperAdmin) {
      const r = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Organização não encontrada' });
      req.org     = r.rows[0];
      req.orgRole = 'owner'; // super admins act as owners everywhere
      return next();
    }

    const r = await query(
      `SELECT om.role, o.*
       FROM org_memberships om
       JOIN organizations o ON o.id = om.org_id
       WHERE om.org_id = $1 AND om.user_id = $2 AND o.is_active = true`,
      [orgId, req.user.sub]
    );

    if (!r.rows.length) return res.status(403).json({ error: 'Sem acesso a esta organização' });
    req.org     = r.rows[0];
    req.orgRole = r.rows[0].role;
    next();
  } catch (err) { next(err); }
}

module.exports = { orgContext };
