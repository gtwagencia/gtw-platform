'use strict';

const axios  = require('axios');
const path   = require('path');
const { query } = require('../../config/database');
const convSvc   = require('../conversations/conversations.service');

const EXT_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif',  '.webp': 'image/webp',
  '.mp4': 'video/mp4',  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

async function list(conversationId, { page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;

  const countRes = await query(
    'SELECT COUNT(*) FROM messages WHERE conversation_id = $1',
    [conversationId]
  );
  const total = parseInt(countRes.rows[0].count, 10);

  const r = await query(
    `SELECT m.*, u.name AS sender_name, u.avatar_url AS sender_avatar
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1
     ORDER BY m.created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );

  return { data: r.rows, total, page, limit };
}

async function send(conversationId, senderId, { content, messageType = 'text', mediaUrl, isPrivate = false }) {
  const convRes = await query(
    `SELECT c.*, i.evolution_api_url, i.evolution_api_key, i.evolution_instance, c.remote_jid, c.workspace_id
     FROM conversations c
     JOIN inboxes i ON i.id = c.inbox_id
     WHERE c.id = $1`,
    [conversationId]
  );
  if (!convRes.rows.length) throw Object.assign(new Error('Conversa não encontrada'), { status: 404 });
  const conv = convRes.rows[0];

  const msgRes = await query(
    `INSERT INTO messages
       (conversation_id, direction, message_type, content, media_url, sender_id, status, is_private)
     VALUES ($1,'outbound',$2,$3,$4,$5,'sent',$6) RETURNING *`,
    [conversationId, messageType, content || null, mediaUrl || null, senderId, isPrivate]
  );
  const message = msgRes.rows[0];

  // Only public messages update last_message and trigger real WhatsApp send
  if (!isPrivate) {
    await convSvc.refreshLastMessage(conversationId, 'outbound');

    // Track first response time + reset bot_active when a real agent responds
    if (senderId) {
      await query(
        `UPDATE conversations
         SET first_response_at = COALESCE(first_response_at, NOW()),
             response_time_seconds = CASE
               WHEN first_response_at IS NULL AND last_inbound_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (NOW() - last_inbound_at))::int
               ELSE response_time_seconds
             END,
             bot_active = false
         WHERE id = $1`,
        [conversationId]
      );

      // Move deal Novo Lead → Em Atendimento e dispara qualificação IA
      require('../kanban/kanban.service')
        .moveToAttending(conversationId)
        .catch(() => {});
    }

    // Send via Evolution API
    if (conv.evolution_api_url && conv.evolution_instance) {
      try {
        const number = conv.remote_jid?.replace(/@.+$/, '') || conv.remote_jid;
        const baseUrl = `${conv.evolution_api_url}`;
        const instance = conv.evolution_instance;
        const headers  = { apikey: conv.evolution_api_key };

        let evoRes;
        if (messageType && messageType !== 'text' && mediaUrl) {
          // Extract filename from URL and get file buffer from storage
          const filename = path.basename(new URL(mediaUrl).pathname);
          const ext      = path.extname(filename).toLowerCase();
          const mime     = EXT_MIME[ext] || 'application/octet-stream';
          const storageSvc = require('../../services/storage.service');
          const fileBuffer = await storageSvc.getFileBuffer(filename);
          const base64     = fileBuffer.toString('base64');

          evoRes = await axios.post(
            `${baseUrl}/message/sendMedia/${instance}`,
            {
              number,
              mediatype: messageType,           // image | video | audio | document
              media:     base64,
              mimetype:  mime,
              caption:   content || '',
              fileName:  filename,
            },
            { headers, timeout: 30000 }
          );
        } else {
          evoRes = await axios.post(
            `${baseUrl}/message/sendText/${instance}`,
            { number, text: content },
            { headers, timeout: 10000 }
          );
        }

        // Store Evolution message ID to avoid duplication when webhook echoes back
        const evoMsgId = evoRes?.data?.key?.id;
        if (evoMsgId) {
          await query('UPDATE messages SET evolution_msg_id = $1 WHERE id = $2', [evoMsgId, message.id]);
          message.evolution_msg_id = evoMsgId;
        }
      } catch (err) {
        const errMsg = err?.response?.data || err?.message;
        require('../../utils/logger').error('Evolution API send failed', { errMsg, conversationId });
        await query('UPDATE messages SET status = $1 WHERE id = $2', ['failed', message.id]);
        message.status = 'failed';
      }
    }
  }

  return message;
}

async function insertInbound(conversationId, { content, messageType, mediaUrl, mediaMimeType, evolutionMsgId, direction = 'inbound' }) {
  const r = await query(
    `INSERT INTO messages
       (conversation_id, direction, message_type, content, media_url, media_mime_type, evolution_msg_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'sent')
     ON CONFLICT (evolution_msg_id) DO NOTHING
     RETURNING *`,
    [conversationId, direction, messageType || 'text', content || null,
      mediaUrl || null, mediaMimeType || null, evolutionMsgId || null]
  );
  return r.rows[0] || null;
}

module.exports = { list, send, insertInbound };
