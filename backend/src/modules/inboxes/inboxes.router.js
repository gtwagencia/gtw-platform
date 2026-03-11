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

module.exports = router;
