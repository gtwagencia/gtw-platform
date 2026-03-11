'use strict';

const { Router } = require('express');
const { authenticate, requireOrgRole } = require('../../middleware/auth');
const { orgContext }                   = require('../../middleware/orgContext');
const { workspaceContext }             = require('../../middleware/workspaceContext');
const svc = require('./workspaces.service');

// mergeParams so :orgId from parent router is available
const router = Router({ mergeParams: true });

// GET /orgs/:orgId/workspaces
router.get('/', authenticate, orgContext, async (req, res, next) => {
  try {
    const list = await svc.listForOrg(
      req.params.orgId,
      req.user.sub,
      req.user.isSuperAdmin,
      req.orgRole
    );
    res.json(list);
  } catch (err) { next(err); }
});

// POST /orgs/:orgId/workspaces
router.post('/', authenticate, orgContext, requireOrgRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { name, logoUrl, timezone } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const ws = await svc.create(req.params.orgId, { name, logoUrl, timezone });
    res.status(201).json(ws);
  } catch (err) { next(err); }
});

// GET /orgs/:orgId/workspaces/:workspaceId
router.get('/:workspaceId', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    res.json(req.workspace);
  } catch (err) { next(err); }
});

// PUT /orgs/:orgId/workspaces/:workspaceId
router.put('/:workspaceId', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (!['admin', 'owner'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const ws = await svc.update(req.params.workspaceId, req.body);
    res.json(ws);
  } catch (err) { next(err); }
});

// ── Members ────────────────────────────────────────────────────────────────

router.get('/:workspaceId/members', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    const members = await svc.listMembers(req.params.workspaceId);
    res.json(members);
  } catch (err) { next(err); }
});

router.post('/:workspaceId/members', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin' && !['owner', 'admin'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'email é obrigatório' });
    const member = await svc.addMember(req.params.workspaceId, { email, role });
    res.status(201).json(member);
  } catch (err) { next(err); }
});

router.put('/:workspaceId/members/:userId/role', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role é obrigatório' });
    const member = await svc.updateMemberRole(req.params.workspaceId, req.params.userId, role);
    res.json(member);
  } catch (err) { next(err); }
});

router.delete('/:workspaceId/members/:userId', authenticate, orgContext, workspaceContext, async (req, res, next) => {
  try {
    await svc.removeMember(req.params.workspaceId, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
