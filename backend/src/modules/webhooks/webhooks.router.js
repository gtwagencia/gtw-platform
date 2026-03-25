'use strict';

/**
 * Evolution API webhook receiver.
 * Each inbox must point to: POST /api/v1/webhooks/evolution/:inboxId
 */

const { Router }     = require('express');
const path           = require('path');
const fs             = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query }      = require('../../config/database');
const contactSvc     = require('../contacts/contacts.service');
const convSvc        = require('../conversations/conversations.service');
const msgSvc         = require('../messages/messages.service');
const kanbanSvc      = require('../kanban/kanban.service');
const aiSvc          = require('../../services/ai.service');
const logger         = require('../../utils/logger');

const router = Router();

const UPLOAD_DIR  = process.env.UPLOAD_DIR  || path.join(process.cwd(), 'uploads');
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'video/mp4':  '.mp4', 'video/webm': '.webm',
  'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/webm': '.weba',
  'application/pdf': '.pdf',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizePhone(jid) {
  return jid?.replace(/@.+$/, '').replace(/\D/g, '') || null;
}

/**
 * Saves base64 media to disk and returns the local URL.
 * Falls back to the CDN URL if no base64 is available.
 */
async function resolveMediaUrl(base64, mimeType, fallbackUrl) {
  if (!base64) return fallbackUrl || null;

  try {
    // Strip data URI prefix if present
    const raw = base64.replace(/^data:[^;]+;base64,/, '');
    const ext  = MIME_EXT[mimeType] || '.bin';
    const filename = `${uuidv4()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.promises.writeFile(filePath, Buffer.from(raw, 'base64'));
    return `${BACKEND_URL}/uploads/${filename}`;
  } catch (err) {
    logger.warn('Failed to save inbound media', { err: err.message });
    return fallbackUrl || null;
  }
}

async function extractMessageContent(msg) {
  // Evolution API sends base64 at msg.base64 when WEBHOOK_BASE64=true
  const b64 = msg.base64 || null;

  if (msg.message?.conversation)
    return { content: msg.message.conversation, messageType: 'text' };

  if (msg.message?.extendedTextMessage?.text)
    return { content: msg.message.extendedTextMessage.text, messageType: 'text' };

  if (msg.message?.imageMessage) {
    const m = msg.message.imageMessage;
    return {
      content:     m.caption || '',
      messageType: 'image',
      mediaUrl:    await resolveMediaUrl(b64, m.mimetype || 'image/jpeg', m.url),
      mediaMimeType: m.mimetype || 'image/jpeg',
    };
  }
  if (msg.message?.videoMessage) {
    const m = msg.message.videoMessage;
    return {
      content:     m.caption || '',
      messageType: 'video',
      mediaUrl:    await resolveMediaUrl(b64, m.mimetype || 'video/mp4', m.url),
      mediaMimeType: m.mimetype || 'video/mp4',
    };
  }
  if (msg.message?.audioMessage) {
    const m = msg.message.audioMessage;
    return {
      content:     '',
      messageType: 'audio',
      mediaUrl:    await resolveMediaUrl(b64, m.mimetype || 'audio/ogg', m.url),
      mediaMimeType: m.mimetype || 'audio/ogg',
    };
  }
  if (msg.message?.documentMessage) {
    const m = msg.message.documentMessage;
    return {
      content:     m.fileName || '',
      messageType: 'document',
      mediaUrl:    await resolveMediaUrl(b64, m.mimetype || 'application/octet-stream', m.url),
      mediaMimeType: m.mimetype,
    };
  }
  if (msg.message?.stickerMessage) {
    const m = msg.message.stickerMessage;
    return {
      content:     '',
      messageType: 'sticker',
      mediaUrl:    await resolveMediaUrl(b64, m.mimetype || 'image/webp', m.url),
      mediaMimeType: m.mimetype || 'image/webp',
    };
  }

  return { content: '[mensagem não suportada]', messageType: 'text' };
}

/**
 * Round-robin auto-assign: pick agent in the department with fewest open conversations.
 */
async function autoAssignAgent(workspaceId, departmentId) {
  const r = await query(
    `SELECT wm.user_id,
            COUNT(c.id)::int AS open_count
     FROM workspace_memberships wm
     LEFT JOIN conversations c
       ON c.assignee_id = wm.user_id
       AND c.workspace_id = $1
       AND c.status = 'open'
     WHERE wm.workspace_id = $1
       AND wm.role = 'agent'
       ${departmentId ? `AND wm.department_id = $2` : ''}
     GROUP BY wm.user_id
     ORDER BY open_count ASC, RANDOM()
     LIMIT 1`,
    departmentId ? [workspaceId, departmentId] : [workspaceId]
  );
  return r.rows[0]?.user_id || null;
}

// ── Main webhook endpoint ──────────────────────────────────────────────────

router.post('/evolution/:inboxId', async (req, res) => {
  res.json({ ok: true });

  const { inboxId } = req.params;
  const event = req.body;

  try {
    const inboxRes = await query('SELECT * FROM inboxes WHERE id = $1', [inboxId]);
    if (!inboxRes.rows.length) return;
    const inbox = inboxRes.rows[0];

    // Segurança via inboxId UUID na URL (impossível de adivinhar).
    // A Evolution API 2.3.7 não suporta headers customizados facilmente,
    // então não validamos a apikey aqui.
    const io    = req.app.get('io');

    const eventType = event.event || event.type;

    // ── CONNECTION_UPDATE ────────────────────────────────────────────────
    if (eventType === 'CONNECTION_UPDATE' || eventType === 'connection.update') {
      const state  = event.data?.state || event.state;
      const qrCode = event.data?.qrcode?.base64 || null;
      const statusMap = { open: 'connected', close: 'disconnected', connecting: 'connecting' };

      await query(
        `UPDATE inboxes SET connection_status = $1, qr_code = $2, updated_at = NOW() WHERE id = $3`,
        [statusMap[state] || 'disconnected', qrCode, inboxId]
      );
      io?.to(`ws:${inbox.workspace_id}`).emit('inbox:status', {
        inboxId, connectionStatus: statusMap[state] || 'disconnected', qrCode,
      });
      return;
    }

    // ── MESSAGES_UPDATE ──────────────────────────────────────────────────
    if (eventType === 'MESSAGES_UPDATE' || eventType === 'messages.update') {
      const updates = Array.isArray(event.data) ? event.data : [event.data];
      for (const upd of updates) {
        if (!upd?.key?.id) continue;
        const statusMap = { 2: 'delivered', 3: 'read', 4: 'read' };
        const newStatus = statusMap[upd.update?.status];
        if (!newStatus) continue;

        await query('UPDATE messages SET status = $1 WHERE evolution_msg_id = $2', [newStatus, upd.key.id]);
        io?.emit('message:status', { evolutionMsgId: upd.key.id, status: newStatus });
      }
      return;
    }

    // ── MESSAGES_UPSERT ──────────────────────────────────────────────────
    if (eventType === 'MESSAGES_UPSERT' || eventType === 'messages.upsert') {
      const messages = Array.isArray(event.data?.messages)
        ? event.data.messages : [event.data];

      for (const msg of messages) {
        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid || remoteJid.includes('@g.us')) continue;

        const isFromMe = !!msg.key?.fromMe;
        const phone    = normalizePhone(remoteJid);
        const pushName = msg.pushName || phone;

        // ── Message sent FROM the connected phone ─────────────────────
        if (isFromMe) {
          const { content, messageType, mediaUrl, mediaMimeType } = await extractMessageContent(msg);

          // Find contact and conversation (only insert if we know this contact)
          const contactRes = await query(
            'SELECT * FROM contacts WHERE workspace_id = $1 AND phone = $2',
            [inbox.workspace_id, phone]
          );
          const contact = contactRes.rows[0];
          if (!contact) continue;

          const { conversation } = await convSvc.findOrCreate(inbox.workspace_id, {
            inboxId: inbox.id, contactId: contact.id, remoteJid,
          });

          // insertInbound with direction='outbound' — ON CONFLICT handles panel duplicates
          const message = await msgSvc.insertInbound(conversation.id, {
            content, messageType, mediaUrl, mediaMimeType,
            evolutionMsgId: msg.key?.id,
            direction: 'outbound',
          });
          if (!message) continue; // Already in DB (sent from panel, deduplicated by evolution_msg_id)

          await convSvc.refreshLastMessage(conversation.id);
          io?.to(`conv:${conversation.id}`).emit('message:new', message);
          io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
            conversationId:  conversation.id,
            lastMessageAt:   new Date(),
            lastMessageText: content,
          });
          continue;
        }

        // ── Inbound message from contact ──────────────────────────────

        // Upsert contact
        let contact;
        try {
          contact = await contactSvc.create(inbox.workspace_id, { name: pushName, phone });
        } catch {
          const r = await query(
            'SELECT * FROM contacts WHERE workspace_id = $1 AND phone = $2',
            [inbox.workspace_id, phone]
          );
          contact = r.rows[0];
        }
        if (!contact) continue;

        const { conversation, created } = await convSvc.findOrCreate(inbox.workspace_id, {
          inboxId: inbox.id, contactId: contact.id, remoteJid,
        });

        const { content, messageType, mediaUrl, mediaMimeType } = await extractMessageContent(msg);
        const message = await msgSvc.insertInbound(conversation.id, {
          content, messageType, mediaUrl, mediaMimeType, evolutionMsgId: msg.key?.id,
        });
        if (!message) continue;

        await convSvc.refreshLastMessage(conversation.id);
        await query(`UPDATE conversations SET last_inbound_at = NOW() WHERE id = $1`, [conversation.id]);

        // ── Auto-assign (round-robin) ─────────────────────────────────
        if (created && inbox.auto_assign && !conversation.assignee_id) {
          const agentId = await autoAssignAgent(inbox.workspace_id, conversation.department_id);
          if (agentId) {
            await query(
              'UPDATE conversations SET assignee_id = $1 WHERE id = $2',
              [agentId, conversation.id]
            );
            conversation.assignee_id = agentId;
          }
        }

        // ── Auto-create CRM deal ──────────────────────────────────────
        if (created) {
          kanbanSvc.createDealFromConversation(inbox.workspace_id, {
            contactId:      contact.id,
            contactName:    contact.name,
            conversationId: conversation.id,
            assigneeId:     conversation.assignee_id || null,
          }).catch(err => logger.warn('Auto-deal creation failed', { err: err.message }));
        }

        // ── Chatbot response ──────────────────────────────────────────
        const isNewOrBotActive = created || conversation.bot_active;
        if (inbox.chatbot_enabled && !conversation.assignee_id && isNewOrBotActive) {
          const wsRes = await query(
            'SELECT anthropic_api_key FROM workspaces WHERE id = $1',
            [inbox.workspace_id]
          );
          const apiKey = wsRes.rows[0]?.anthropic_api_key;

          if (apiKey) {
            await query('UPDATE conversations SET bot_active = true WHERE id = $1', [conversation.id]);

            aiSvc.generateChatbotResponse(conversation.id, inbox.chatbot_prompt, apiKey)
              .then(async (botReply) => {
                if (!botReply) return;
                const botMsg = await msgSvc.send(conversation.id, null, {
                  content: botReply, messageType: 'text', isPrivate: false,
                });
                io?.to(`conv:${conversation.id}`).emit('message:new', botMsg);
                io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
                  conversationId:  conversation.id,
                  lastMessageAt:   new Date(),
                  lastMessageText: botReply,
                });
              })
              .catch(err => logger.warn('Chatbot send failed', { err: err.message }));
          }
        }

        // ── Broadcast ─────────────────────────────────────────────────
        if (created) {
          io?.to(`ws:${inbox.workspace_id}`).emit('conversation:new', {
            conversationId: conversation.id, contactName: contact.name, inboxId: inbox.id,
          });
        }
        io?.to(`conv:${conversation.id}`).emit('message:new', message);
        io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
          conversationId:  conversation.id,
          lastMessageAt:   new Date(),
          lastMessageText: content,
          unreadCount:     (conversation.unread_count || 0) + 1,
        });
      }
    }
  } catch (err) {
    logger.error('Webhook processing error', { err: err.message, inboxId });
  }
});

module.exports = router;
