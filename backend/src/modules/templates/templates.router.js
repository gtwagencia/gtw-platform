'use strict';

/**
 * HSM / WhatsApp Templates
 * Busca templates direto da Evolution API e permite envio para uma conversa.
 */

const { Router } = require('express');
const axios      = require('axios');
const { query }  = require('../../config/database');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const logger = require('../../utils/logger');

const router = Router({ mergeParams: true });

// ── GET /workspaces/:workspaceId/templates?inboxId=xxx
// Lista templates disponíveis na instância Evolution da inbox
router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { inboxId } = req.query;
    if (!inboxId) return res.status(400).json({ error: 'inboxId é obrigatório' });

    const inboxRes = await query(
      'SELECT evolution_api_url, evolution_api_key, evolution_instance FROM inboxes WHERE id = $1 AND workspace_id = $2',
      [inboxId, req.params.workspaceId]
    );
    if (!inboxRes.rows.length) return res.status(404).json({ error: 'Inbox não encontrada' });

    const { evolution_api_url, evolution_api_key, evolution_instance } = inboxRes.rows[0];
    if (!evolution_api_url || !evolution_instance) {
      return res.status(400).json({ error: 'Inbox não configurada com Evolution API' });
    }

    const { data } = await axios.get(
      `${evolution_api_url}/template/findAll/${evolution_instance}`,
      { headers: { apikey: evolution_api_key }, timeout: 10000 }
    );

    // Normaliza a resposta da Evolution API (pode variar entre versões)
    const templates = Array.isArray(data) ? data : (data?.templates || []);
    res.json(templates);
  } catch (err) {
    logger.warn('Falha ao buscar templates', { err: err.message });
    // Retorna array vazio em vez de 500 para não quebrar o frontend
    res.json([]);
  }
});

// ── POST /workspaces/:workspaceId/templates/send
// Envia um template HSM para uma conversa específica
router.post('/send', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { conversationId, templateName, language = 'pt_BR', components = [] } = req.body;
    if (!conversationId || !templateName) {
      return res.status(400).json({ error: 'conversationId e templateName são obrigatórios' });
    }

    // Busca conversa + inbox
    const convRes = await query(
      `SELECT c.remote_jid, c.workspace_id,
              i.evolution_api_url, i.evolution_api_key, i.evolution_instance
       FROM conversations c
       JOIN inboxes i ON i.id = c.inbox_id
       WHERE c.id = $1 AND c.workspace_id = $2`,
      [conversationId, req.params.workspaceId]
    );
    if (!convRes.rows.length) return res.status(404).json({ error: 'Conversa não encontrada' });

    const { remote_jid, evolution_api_url, evolution_api_key, evolution_instance } = convRes.rows[0];
    if (!evolution_api_url || !evolution_instance) {
      return res.status(400).json({ error: 'Inbox não configurada com Evolution API' });
    }

    // Envia via Evolution API
    await axios.post(
      `${evolution_api_url}/message/sendTemplate/${evolution_instance}`,
      {
        number: remote_jid,
        template: {
          name: templateName,
          language: { code: language },
          components,
        },
      },
      { headers: { apikey: evolution_api_key }, timeout: 15000 }
    );

    // Registra como mensagem outbound no banco
    const msgRes = await query(
      `INSERT INTO messages
         (conversation_id, direction, message_type, content, sender_id, status)
       VALUES ($1, 'outbound', 'template', $2, $3, 'sent') RETURNING *`,
      [conversationId, `[Template: ${templateName}]`, req.user.id]
    );

    const io = req.app.get('io');
    io?.to(`conv:${conversationId}`).emit('message:new', msgRes.rows[0]);

    res.json(msgRes.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
