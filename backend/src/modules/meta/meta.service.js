'use strict';

/**
 * Meta Conversions API integration.
 * Sends server-side events to the Meta Conversions API.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

const axios  = require('axios');
const crypto = require('crypto');
const { query } = require('../../config/database');
const logger    = require('../../utils/logger');

const META_API_VERSION = 'v19.0';
const META_API_BASE    = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Helpers ────────────────────────────────────────────────────────────────

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

function buildUserData(contact, metaCtwaClid) {
  return {
    ph:  contact.phone ? sha256(contact.phone.replace(/\D/g, '')) : undefined,
    em:  contact.email ? sha256(contact.email)                    : undefined,
    fbc: metaCtwaClid  ? `fb.1.${Date.now()}.${metaCtwaClid}`    :
         contact.meta_lead_id ? `fb.1.${Date.now()}.${contact.meta_lead_id}` : undefined,
    fbp: undefined,
    country: sha256('br'),
  };
}

function buildCustomData(deal) {
  return {
    currency:   deal.currency || 'BRL',
    value:      deal.value    || 0,
  };
}

// ── Send event ─────────────────────────────────────────────────────────────

async function sendEvent(workspace, { eventName, contact, deal, sourceUrl, metaCtwaClid }) {
  if (!workspace.meta_conversions_token || !workspace.meta_pixel_id) {
    throw Object.assign(new Error('Meta Conversions API não configurada neste workspace'), { status: 400 });
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const eventId   = `${eventName}_${deal?.id || contact?.id}_${eventTime}`;

  const payload = {
    data: [{
      event_name:    eventName,
      event_time:    eventTime,
      event_id:      eventId,
      action_source: 'crm',
      event_source_url: sourceUrl,
      user_data:     buildUserData(contact, metaCtwaClid || deal?.meta_ctwa_clid),
      custom_data:   deal ? buildCustomData(deal) : undefined,
    }],
  };

  // Log to DB (pending)
  const logRes = await query(
    `INSERT INTO meta_conversion_events
       (workspace_id, contact_id, deal_id, event_name, event_value, currency, payload, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
    [
      workspace.id,
      contact?.id || null,
      deal?.id    || null,
      eventName,
      deal?.value || null,
      deal?.currency || 'BRL',
      payload,
    ]
  );
  const log = logRes.rows[0];

  // Send to Meta
  try {
    const resp = await axios.post(
      `${META_API_BASE}/${workspace.meta_pixel_id}/events`,
      { ...payload, access_token: workspace.meta_conversions_token },
      { timeout: 10000 }
    );

    await query(
      `UPDATE meta_conversion_events
       SET status = 'sent', meta_response = $1, sent_at = NOW()
       WHERE id = $2`,
      [resp.data, log.id]
    );

    logger.info('Meta event sent', { eventName, pixelId: workspace.meta_pixel_id });
    return { ok: true, response: resp.data };
  } catch (err) {
    const errorData = err.response?.data || { message: err.message };
    await query(
      `UPDATE meta_conversion_events SET status = 'failed', meta_response = $1 WHERE id = $2`,
      [errorData, log.id]
    );
    logger.error('Meta event failed', { eventName, error: err.message });
    throw Object.assign(new Error('Falha ao enviar evento Meta: ' + err.message), { status: 502 });
  }
}

// ── Convenience wrappers ───────────────────────────────────────────────────

async function sendPurchaseEvent(workspace, { contact, deal }) {
  return sendEvent(workspace, { eventName: 'Purchase', contact, deal });
}

async function sendLeadEvent(workspace, { contact, metaCtwaClid }) {
  return sendEvent(workspace, { eventName: 'Lead', contact, metaCtwaClid });
}

// ── Event history ──────────────────────────────────────────────────────────

async function listEvents(workspaceId, { page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  const r = await query(
    `SELECT mce.*,
            c.name AS contact_name,
            c.phone AS contact_phone
     FROM meta_conversion_events mce
     LEFT JOIN contacts c ON c.id = mce.contact_id
     WHERE mce.workspace_id = $1
     ORDER BY mce.created_at DESC
     LIMIT $2 OFFSET $3`,
    [workspaceId, limit, offset]
  );
  const countRes = await query(
    'SELECT COUNT(*) FROM meta_conversion_events WHERE workspace_id = $1',
    [workspaceId]
  );
  return { data: r.rows, total: parseInt(countRes.rows[0].count, 10), page, limit };
}

module.exports = { sendEvent, sendPurchaseEvent, sendLeadEvent, listEvents };
