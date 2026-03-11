'use strict';

const { Router } = require('express');
const { authenticate } = require('../../middleware/auth');
const svc = require('./messages.service');

// Route is mounted at /api/v1/conversations/:conversationId/messages
const router = Router({ mergeParams: true });

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.list(req.params.conversationId, {
      page:  parseInt(page,  10) || 1,
      limit: parseInt(limit, 10) || 50,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { content, messageType, mediaUrl } = req.body;
    if (!content && !mediaUrl) {
      return res.status(400).json({ error: 'content ou mediaUrl é obrigatório' });
    }
    const message = await svc.send(
      req.params.conversationId,
      req.user.sub,
      { content, messageType, mediaUrl }
    );

    // Broadcast to all agents watching this conversation
    req.app.get('io')
      ?.to(`conv:${req.params.conversationId}`)
      .emit('message:new', message);

    res.status(201).json(message);
  } catch (err) { next(err); }
});

module.exports = router;
