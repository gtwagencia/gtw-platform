'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./conversations.service');

const router = Router({ mergeParams: true });

function getCaller(req) {
  return {
    isSuperAdmin:  req.user.isSuperAdmin,
    orgRole:       req.orgRole,
    workspaceRole: req.workspaceRole,
    userId:        req.user.sub,
  };
}

router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { status, inboxId, assigneeId, departmentId, contactId, labelId, page, limit } = req.query;
    const result = await svc.list(
      req.params.workspaceId,
      { status, inboxId, assigneeId, departmentId, contactId, labelId,
        page: parseInt(page, 10) || 1, limit: parseInt(limit, 10) || 30 },
      getCaller(req)
    );
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:conversationId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const conv = await svc.getById(
      req.params.conversationId, req.params.workspaceId, getCaller(req)
    );
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    res.json(conv);
  } catch (err) { next(err); }
});

router.put('/:conversationId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const caller = getCaller(req);
    if (caller.workspaceRole === 'agent' && !caller.isSuperAdmin
        && !['owner','admin'].includes(caller.orgRole)) {
      const conv = await svc.getById(req.params.conversationId, req.params.workspaceId, caller);
      if (!conv) return res.status(403).json({ error: 'Acesso negado a esta conversa' });
    }

    const updated = await svc.update(
      req.params.conversationId, req.params.workspaceId, req.body
    );
    req.app.get('io')
      ?.to(`ws:${req.params.workspaceId}`)
      .emit('conversation:updated', updated);
    res.json(updated);
  } catch (err) { next(err); }
});

// CSAT endpoint — requer autenticação e verifica ownership
router.post('/:conversationId/csat', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating deve ser entre 1 e 5' });
    }
    // Verifica que a conversa pertence ao workspace
    const conv = await svc.getById(req.params.conversationId, req.params.workspaceId, getCaller(req));
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    const updated = await svc.update(
      req.params.conversationId, req.params.workspaceId,
      { csatRating: parseInt(rating, 10), csatComment: comment || null }
    );
    res.json({ ok: true, csatRating: updated.csat_rating });
  } catch (err) { next(err); }
});

router.post('/:conversationId/read', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.markRead(req.params.conversationId, req.params.workspaceId);
    req.app.get('io')
      ?.to(`ws:${req.params.workspaceId}`)
      .emit('conversation:updated', { conversationId: req.params.conversationId, unread_count: 0 });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
