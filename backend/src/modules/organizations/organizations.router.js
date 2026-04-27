'use strict';

const { Router } = require('express');
const { authenticate }    = require('../../middleware/auth');
const { orgContext }      = require('../../middleware/orgContext');
const { requireOrgRole }  = require('../../middleware/auth');
const svc = require('./organizations.service');

const router = Router();

// GET /orgs — list orgs for current user
router.get('/', authenticate, async (req, res, next) => {
  try {
    const orgs = await svc.listForUser(req.user.sub, req.user.isSuperAdmin);
    res.json(orgs);
  } catch (err) { next(err); }
});

// GET /orgs/:orgId
router.get('/:orgId', authenticate, orgContext, async (req, res, next) => {
  try {
    res.json(req.org);
  } catch (err) { next(err); }
});

// PUT /orgs/:orgId — only owner or super admin
router.put('/:orgId', authenticate, orgContext, requireOrgRole('owner'), async (req, res, next) => {
  try {
    const { name, logoUrl, plan, isActive } = req.body;
    const org = await svc.update(req.params.orgId, { name, logoUrl, plan, isActive });
    res.json(org);
  } catch (err) { next(err); }
});

// ── Members ────────────────────────────────────────────────────────────────

router.get('/:orgId/members', authenticate, orgContext, requireOrgRole('owner', 'admin'), async (req, res, next) => {
  try {
    const members = await svc.listMembers(req.params.orgId);
    res.json(members);
  } catch (err) { next(err); }
});

router.post('/:orgId/members', authenticate, orgContext, requireOrgRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'email é obrigatório' });
    const member = await svc.inviteMember(req.params.orgId, { email, role });
    res.status(201).json(member);
  } catch (err) { next(err); }
});

router.put('/:orgId/members/:userId/role', authenticate, orgContext, requireOrgRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role é obrigatório' });
    const member = await svc.updateMemberRole(req.params.orgId, req.params.userId, role);
    res.json(member);
  } catch (err) { next(err); }
});

router.delete('/:orgId/members/:userId', authenticate, orgContext, requireOrgRole('owner', 'admin'), async (req, res, next) => {
  try {
    await svc.removeMember(req.params.orgId, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
