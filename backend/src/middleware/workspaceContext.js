'use strict';

const { query } = require('../config/database');

/**
 * Loads workspace + caller's role into req.workspace / req.workspaceRole.
 * Expects :workspaceId in route params and authenticate() to have run first.
 * Also respects req.orgRole if set by orgContext middleware.
 */
async function workspaceContext(req, res, next) {
  try {
    const workspaceId = req.params.workspaceId;
    if (!workspaceId) return next();

    // Super admins and org owners/admins get full access
    if (req.user.isSuperAdmin || ['owner', 'admin'].includes(req.orgRole)) {
      const r = await query('SELECT * FROM workspaces WHERE id = $1', [workspaceId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Workspace não encontrado' });
      req.workspace     = r.rows[0];
      req.workspaceRole = 'admin';
      return next();
    }

    const r = await query(
      `SELECT wm.role, w.*
       FROM workspace_memberships wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.is_active = true`,
      [workspaceId, req.user.sub]
    );

    if (!r.rows.length) return res.status(403).json({ error: 'Sem acesso a este workspace' });
    req.workspace     = r.rows[0];
    req.workspaceRole = r.rows[0].role;
    next();
  } catch (err) { next(err); }
}

module.exports = { workspaceContext };
