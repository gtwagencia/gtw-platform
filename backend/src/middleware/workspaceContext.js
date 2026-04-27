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

/**
 * Bloqueia acesso a rotas proibidas para o role tickets_only.
 * Carrega o workspaceRole do banco se ainda não estiver no request.
 * Pode ser usado como middleware antes dos routers no server.js.
 */
async function requireNotTicketsOnly(req, res, next) {
  try {
    // Se o role já foi carregado por workspaceContext, usa diretamente
    let role = req.workspaceRole;

    // Senão, precisa autenticar e buscar o role
    if (!role) {
      // Autentica sem parar o fluxo (se falhar, deixa o router lidar)
      const jwt = require('jsonwebtoken');
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!token) return next(); // sem token: próximo middleware lidará

      let userId;
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.sub;
        if (decoded.isSuperAdmin) return next(); // super admins passam sempre
      } catch {
        return next(); // token inválido: router cuidará do 401
      }

      const workspaceId = req.params.workspaceId;
      if (!workspaceId) return next();

      const r = await query(
        `SELECT wm.role FROM workspace_memberships wm
         JOIN workspaces w ON w.id = wm.workspace_id
         WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.is_active = true`,
        [workspaceId, userId]
      );
      role = r.rows[0]?.role;
    }

    if (role === 'tickets_only') {
      return res.status(403).json({
        error: 'Acesso negado. Seu perfil só tem acesso ao módulo de Tickets.',
      });
    }

    next();
  } catch (err) { next(err); }
}

module.exports = { workspaceContext, requireNotTicketsOnly };
