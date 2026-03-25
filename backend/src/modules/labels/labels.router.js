'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./labels.service');

const router = Router({ mergeParams: true });

// Workspace-level label CRUD
router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.list(req.params.workspaceId));
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    res.status(201).json(await svc.create(req.params.workspaceId, { name, color }));
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.update(req.params.id, req.params.workspaceId, req.body));
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.remove(req.params.id, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Conversation-level label operations (mounted separately from conversations router)
router.get('/conversation/:conversationId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.getForConversation(req.params.conversationId));
  } catch (err) { next(err); }
});

router.post('/conversation/:conversationId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { labelId } = req.body;
    if (!labelId) return res.status(400).json({ error: 'labelId é obrigatório' });
    await svc.addToConversation(req.params.conversationId, labelId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/conversation/:conversationId/:labelId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.removeFromConversation(req.params.conversationId, req.params.labelId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
