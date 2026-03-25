'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./canned-responses.service');

const router = Router({ mergeParams: true });

router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const data = await svc.list(req.params.workspaceId, req.query.search);
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { shortcut, content } = req.body;
    if (!shortcut || !content) return res.status(400).json({ error: 'shortcut e content são obrigatórios' });
    const data = await svc.create(req.params.workspaceId, { shortcut, content }, req.user.sub);
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const data = await svc.update(req.params.id, req.params.workspaceId, req.body);
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.remove(req.params.id, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
