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
    ph:      contact.phone ? sha256(contact.phone.replace(/\D/g, '')) : undefined,
    em:      contact.email ? sha256(contact.email)                    : undefined,
    fbc:     metaCtwaClid  ? `fb.1.${Date.now()}.${metaCtwaClid}`    :
             contact.meta_lead_id ? `fb.1.${Date.now()}.${contact.meta_lead_id}` : undefined,
    country: 'br', // código ISO sem hash — Meta não aceita hash aqui
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
      action_source: 'chat', // WhatsApp = chat; 'crm' não é valor válido na CAPI
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
    logger.error('Meta event failed', { eventName, error: err.message, metaError: errorData });
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

// ── Detecção de compra em mensagem ────────────────────────────────────────

/**
 * Tenta identificar uma confirmação de pedido/compra em uma mensagem.
 * Retorna { value, orderId, currency } ou null se não for pedido.
 */
function detectPurchaseFromMessage(content) {
  if (!content || content.length < 20) return null;

  // Verifica padrões típicos de confirmação de pedido
  const isPurchase = /pedido\s*#?\d+/i.test(content)
    || /recebemos.*pedido/i.test(content)
    || /confirma[çc][aã]o.*pedido/i.test(content)
    || /seu pedido.*foi/i.test(content);

  if (!isPurchase) return null;

  // Extrai número do pedido
  const orderMatch = content.match(/pedido\s*#?(\d+)/i);
  const orderId    = orderMatch ? orderMatch[1] : null;

  // Extrai valor total (suporta R$ 139,90 e R$ 139.90)
  // Procura pela linha "Total:" ou "Total Geral:"
  const totalMatch = content.match(/Total(?:\s*Geral)?[:\s*]+R?\$?\s*([\d.,]+)/im);
  if (!totalMatch) return null;

  const raw      = totalMatch[1].trim();
  // Converte formato brasileiro (1.234,56 → 1234.56) ou americano (1,234.56 → 1234.56)
  let valueStr;
  if ( /\d{1,3}\.\d{3},\d{2}$/.test(raw) ) {
    valueStr = raw.replace(/\./g, '').replace(',', '.'); // 1.234,56 → 1234.56
  } else if ( /,\d{2}$/.test(raw) ) {
    valueStr = raw.replace(',', '.'); // 139,90 → 139.90
  } else {
    valueStr = raw; // já está em formato ponto
  }

  const value = parseFloat(valueStr);
  if (isNaN(value) || value <= 0) return null;

  return { value, orderId, currency: 'BRL' };
}

// ── Marketing API: busca detalhes do anúncio ──────────────────────────────

/**
 * Dado um ad_id da Meta, retorna nome do anúncio, conjunto e campanha.
 * Requer meta_access_token no workspace.
 */
async function fetchAdDetails(accessToken, adId) {
  if (!accessToken || !adId) return null;
  try {
    const resp = await axios.get(`${META_API_BASE}/${adId}`, {
      params: {
        fields: 'name,adset{name,campaign{name}}',
        access_token: accessToken,
      },
      timeout: 8000,
    });
    const d = resp.data;
    return {
      ad_name:       d.name        || null,
      adset_name:    d.adset?.name || null,
      campaign_name: d.adset?.campaign?.name || null,
    };
  } catch (err) {
    logger.warn('Meta fetchAdDetails failed', { adId, err: err.response?.data?.error?.message || err.message });
    return null;
  }
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

module.exports = { sendEvent, sendPurchaseEvent, sendLeadEvent, listEvents, fetchAdDetails, detectPurchaseFromMessage };
