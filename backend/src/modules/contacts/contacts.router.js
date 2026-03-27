'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./contacts.service');

const router = Router({ mergeParams: true });

router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;
    const result = await svc.list(req.params.workspaceId, {
      search: search?.slice(0, 200),
      page:   parseInt(page,  10) || 1,
      limit:  Math.min(parseInt(limit, 10) || 50, 200),
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const contact = await svc.create(req.params.workspaceId, req.body);
    res.status(201).json(contact);
  } catch (err) { next(err); }
});

router.get('/:contactId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const c = await svc.getById(req.params.contactId, req.params.workspaceId);
    if (!c) return res.status(404).json({ error: 'Contato não encontrado' });
    res.json(c);
  } catch (err) { next(err); }
});

router.put('/:contactId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const c = await svc.update(req.params.contactId, req.params.workspaceId, req.body);
    res.json(c);
  } catch (err) { next(err); }
});

router.delete('/:contactId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.remove(req.params.contactId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:contactId/conversations', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const convs = await svc.listConversations(req.params.contactId, req.params.workspaceId);
    res.json(convs);
  } catch (err) { next(err); }
});

module.exports = router;
