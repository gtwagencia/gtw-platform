'use strict';

/**
 * Evolution API webhook receiver.
 *
 * Each Evolution instance must be configured to POST events to:
 *   POST /api/v1/webhooks/evolution/:inboxId
 *
 * Supported events:
 *   - MESSAGES_UPSERT   → create inbound message + conversation
 *   - CONNECTION_UPDATE → update inbox connection_status / qr_code
 *   - MESSAGES_UPDATE   → update message status (delivered/read)
 */

const { Router }  = require('express');
const { query }   = require('../../config/database');
const contactSvc  = require('../contacts/contacts.service');
const convSvc     = require('../conversations/conversations.service');
const msgSvc      = require('../messages/messages.service');
const kanbanSvc   = require('../kanban/kanban.service');
const logger      = require('../../utils/logger');

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizePhone(jid) {
  // Strip @s.whatsapp.net and country code formatting
  return jid?.replace(/@.+$/, '').replace(/\D/g, '') || null;
}

function extractMessageContent(msg) {
  if (msg.message?.conversation)
    return { content: msg.message.conversation, messageType: 'text' };
  if (msg.message?.extendedTextMessage?.text)
    return { content: msg.message.extendedTextMessage.text, messageType: 'text' };
  if (msg.message?.imageMessage)
    return { content: msg.message.imageMessage.caption || '', messageType: 'image', mediaUrl: msg.message.imageMessage.url };
  if (msg.message?.audioMessage)
    return { content: '', messageType: 'audio', mediaUrl: msg.message.audioMessage.url };
  if (msg.message?.videoMessage)
    return { content: msg.message.videoMessage.caption || '', messageType: 'video', mediaUrl: msg.message.videoMessage.url };
  if (msg.message?.documentMessage)
    return { content: msg.message.documentMessage.fileName || '', messageType: 'document', mediaUrl: msg.message.documentMessage.url };
  if (msg.message?.stickerMessage)
    return { content: '', messageType: 'sticker', mediaUrl: msg.message.stickerMessage.url };
  return { content: '[mensagem não suportada]', messageType: 'text' };
}

// ── Main webhook endpoint ──────────────────────────────────────────────────

router.post('/evolution/:inboxId', async (req, res) => {
  // Always return 200 quickly so Evolution doesn't retry
  res.json({ ok: true });

  const { inboxId } = req.params;
  const event = req.body;

  try {
    // Load inbox to get workspace context
    const inboxRes = await query(
      'SELECT * FROM inboxes WHERE id = $1',
      [inboxId]
    );
    if (!inboxRes.rows.length) return;
    const inbox = inboxRes.rows[0];
    const io    = req.app.get('io');

    const eventType = event.event || event.type;

    // ── CONNECTION_UPDATE ────────────────────────────────────────────────
    if (eventType === 'CONNECTION_UPDATE' || eventType === 'connection.update') {
      const state  = event.data?.state || event.state;
      const qrCode = event.data?.qrcode?.base64 || null;

      const statusMap = {
        open:  'connected',
        close: 'disconnected',
        connecting: 'connecting',
      };

      await query(
        `UPDATE inboxes SET connection_status = $1, qr_code = $2, updated_at = NOW()
         WHERE id = $3`,
        [statusMap[state] || 'disconnected', qrCode, inboxId]
      );

      io?.to(`ws:${inbox.workspace_id}`).emit('inbox:status', {
        inboxId,
        connectionStatus: statusMap[state] || 'disconnected',
        qrCode,
      });
      return;
    }

    // ── MESSAGES_UPDATE (status receipts) ────────────────────────────────
    if (eventType === 'MESSAGES_UPDATE' || eventType === 'messages.update') {
      const updates = Array.isArray(event.data) ? event.data : [event.data];
      for (const upd of updates) {
        if (!upd?.key?.id) continue;
        const statusMap = { 2: 'delivered', 3: 'read', 4: 'read' };
        const newStatus = statusMap[upd.update?.status];
        if (!newStatus) continue;

        await query(
          'UPDATE messages SET status = $1 WHERE evolution_msg_id = $2',
          [newStatus, upd.key.id]
        );
        io?.emit('message:status', { evolutionMsgId: upd.key.id, status: newStatus });
      }
      return;
    }

    // ── MESSAGES_UPSERT ──────────────────────────────────────────────────
    if (eventType === 'MESSAGES_UPSERT' || eventType === 'messages.upsert') {
      const messages = Array.isArray(event.data?.messages)
        ? event.data.messages
        : [event.data];

      for (const msg of messages) {
        // Skip outbound (fromMe) messages
        if (msg.key?.fromMe) continue;

        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid || remoteJid.includes('@g.us')) continue; // skip groups

        const phone = normalizePhone(remoteJid);
        const pushName = msg.pushName || phone;

        // Upsert contact
        let contact;
        try {
          contact = await contactSvc.create(inbox.workspace_id, {
            name:  pushName,
            phone: phone,
          });
        } catch {
          const r = await query(
            'SELECT * FROM contacts WHERE workspace_id = $1 AND phone = $2',
            [inbox.workspace_id, phone]
          );
          contact = r.rows[0];
        }
        if (!contact) continue;

        // Find or create conversation
        const { conversation, created } = await convSvc.findOrCreate(inbox.workspace_id, {
          inboxId:    inbox.id,
          contactId:  contact.id,
          remoteJid,
        });

        // Insert message
        const { content, messageType, mediaUrl } = extractMessageContent(msg);
        const message = await msgSvc.insertInbound(conversation.id, {
          content,
          messageType,
          mediaUrl,
          evolutionMsgId: msg.key?.id,
        });

        if (!message) continue; // duplicate

        await convSvc.refreshLastMessage(conversation.id);

        // Track last inbound time (for follow-up and response time)
        await query(
          `UPDATE conversations SET last_inbound_at = NOW() WHERE id = $1`,
          [conversation.id]
        );

        // Auto-create CRM deal on new conversation
        if (created) {
          kanbanSvc.createDealFromConversation(inbox.workspace_id, {
            contactId:      contact.id,
            contactName:    contact.name,
            conversationId: conversation.id,
            assigneeId:     conversation.assignee_id || null,
          }).catch(err => logger.warn('Auto-deal creation failed', { err: err.message }));
        }

        // Broadcast
        if (created) {
          io?.to(`ws:${inbox.workspace_id}`).emit('conversation:new', {
            conversationId: conversation.id,
            contactName:    contact.name,
            inboxId:        inbox.id,
          });
        }
        io?.to(`conv:${conversation.id}`).emit('message:new', message);
        io?.to(`ws:${inbox.workspace_id}`).emit('conversation:updated', {
          conversationId:   conversation.id,
          lastMessageAt:    new Date(),
          lastMessageText:  content,
          unreadCount:      (conversation.unread_count || 0) + 1,
        });
      }
    }
  } catch (err) {
    logger.error('Webhook processing error', { err: err.message, inboxId });
  }
});

module.exports = router;
