'use strict';

const { Router } = require('express');
const { query }  = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const svc = require('./messages.service');

// Route is mounted at /api/v1/conversations/:conversationId/messages
const router = Router({ mergeParams: true });

/**
 * Verifica que o usuário autenticado tem acesso à conversa.
 * Previne IDOR: um agente de um workspace não pode ler mensagens de outro.
 */
async function assertConversationAccess(req, res, next) {
  try {
    const { conversationId } = req.params;
    const userId = req.user.sub;
    const isSuperAdmin = req.user.isSuperAdmin;

    if (isSuperAdmin) return next();

    const r = await query(
      `SELECT 1 FROM conversations c
       JOIN workspace_memberships wm ON wm.workspace_id = c.workspace_id
       WHERE c.id = $1 AND wm.user_id = $2`,
      [conversationId, userId]
    );
    if (!r.rows.length) return res.status(403).json({ error: 'Acesso negado a esta conversa' });
    next();
  } catch (err) { next(err); }
}

router.get('/', authenticate, assertConversationAccess, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.list(req.params.conversationId, {
      page:  parseInt(page,  10) || 1,
      limit: parseInt(limit, 10) || 50,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', authenticate, assertConversationAccess, async (req, res, next) => {
  try {
    const { content, messageType, mediaUrl, isPrivate } = req.body;
    if (!content && !mediaUrl) {
      return res.status(400).json({ error: 'content ou mediaUrl é obrigatório' });
    }
    const message = await svc.send(
      req.params.conversationId,
      req.user.sub,
      { content, messageType, mediaUrl, isPrivate: Boolean(isPrivate) }
    );

    // Emite para o room da conversa E para o workspace inteiro
    // para garantir entrega mesmo quando join:conversation não completou
    const convRes = await query(
      'SELECT workspace_id FROM conversations WHERE id = $1',
      [req.params.conversationId]
    );
    const workspaceId = convRes.rows[0]?.workspace_id;
    const io = req.app.get('io');
    io?.to(`conv:${req.params.conversationId}`).emit('message:new', message);
    if (workspaceId) io?.to(`ws:${workspaceId}`).emit('message:new', message);

    res.status(201).json(message);
  } catch (err) { next(err); }
});

module.exports = router;
