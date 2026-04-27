'use strict';

const { Router } = require('express');
const { authenticate }         = require('../../middleware/auth');
const { workspaceContext }     = require('../../middleware/workspaceContext');
const svc = require('./inboxes.service');

const router = Router({ mergeParams: true });

router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const list = await svc.list(req.params.workspaceId);
    res.json(list);
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (!['admin'].includes(req.workspaceRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Apenas admins podem criar inboxes' });
    }
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const inbox = await svc.create(req.params.workspaceId, req.body);
    res.status(201).json(inbox);
  } catch (err) { next(err); }
});

router.get('/:inboxId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const inbox = await svc.getById(req.params.inboxId, req.params.workspaceId);
    if (!inbox) return res.status(404).json({ error: 'Inbox não encontrado' });
    res.json(inbox);
  } catch (err) { next(err); }
});

router.put('/:inboxId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const inbox = await svc.update(req.params.inboxId, req.params.workspaceId, req.body);
    res.json(inbox);
  } catch (err) { next(err); }
});

router.delete('/:inboxId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.remove(req.params.inboxId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Membros do Inbox ───────────────────────────────────────────────────────

router.get('/:inboxId/members', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const members = await svc.listMembers(req.params.inboxId, req.params.workspaceId);
    res.json(members);
  } catch (err) { next(err); }
});

router.post('/:inboxId/members', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin' && !['owner','admin'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
    const member = await svc.addMember(req.params.inboxId, userId, req.params.workspaceId);
    res.status(201).json(member);
  } catch (err) { next(err); }
});

router.delete('/:inboxId/members/:userId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin' && !['owner','admin'].includes(req.orgRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    await svc.removeMember(req.params.inboxId, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
