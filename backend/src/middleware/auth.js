'use strict';

const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}

function requireOrgRole(...roles) {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) return next();
    if (!roles.includes(req.user?.orgRole)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

function requireWorkspaceRole(...roles) {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) return next();
    if (req.user?.orgRole === 'owner' || req.user?.orgRole === 'admin') return next();
    if (!roles.includes(req.user?.workspaceRole)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

module.exports = { authenticate, requireSuperAdmin, requireOrgRole, requireWorkspaceRole };
