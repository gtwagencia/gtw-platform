'use strict';

const { query } = require('../../config/database');

async function list(workspaceId, { search, page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  const params = [workspaceId];
  let where = 'WHERE c.workspace_id = $1';

  if (search) {
    params.push(`%${search}%`);
    where += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
  }

  const countRes = await query(`SELECT COUNT(*) FROM contacts c ${where}`, params);
  const total    = parseInt(countRes.rows[0].count, 10);

  params.push(limit, offset);
  const r = await query(
    `SELECT c.*,
            COUNT(DISTINCT conv.id)::int AS conversation_count,
            COUNT(DISTINCT d.id)::int    AS deal_count
     FROM contacts c
     LEFT JOIN conversations conv ON conv.contact_id = c.id
     LEFT JOIN deals d ON d.contact_id = c.id
     ${where}
     GROUP BY c.id
     ORDER BY c.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { data: r.rows, total, page, limit };
}

async function getById(contactId, workspaceId) {
  const r = await query(
    'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
    [contactId, workspaceId]
  );
  return r.rows[0] || null;
}

async function create(workspaceId, body) {
  const {
    name, phone, email, avatarUrl,
    metaLeadId, metaCampaignId, metaAdsetId, metaAdId, metaFormId,
    utmSource, utmCampaign, utmMedium,
    tags, notes, customFields,
  } = body;

  const r = await query(
    `INSERT INTO contacts
       (workspace_id, name, phone, email, avatar_url,
        meta_lead_id, meta_campaign_id, meta_adset_id, meta_ad_id, meta_form_id,
        utm_source, utm_campaign, utm_medium,
        tags, notes, custom_fields)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (workspace_id, phone) DO UPDATE
       SET name = EXCLUDED.name, email = EXCLUDED.email,
           meta_lead_id = COALESCE(EXCLUDED.meta_lead_id, contacts.meta_lead_id),
           updated_at = NOW()
     RETURNING *`,
    [workspaceId, name, phone || null, email || null, avatarUrl || null,
      metaLeadId || null, metaCampaignId || null, metaAdsetId || null,
      metaAdId || null, metaFormId || null,
      utmSource || null, utmCampaign || null, utmMedium || null,
      tags || [], notes || null, customFields || {}]
  );
  return r.rows[0];
}

async function update(contactId, workspaceId, body) {
  const map = {
    name: 'name', phone: 'phone', email: 'email', avatarUrl: 'avatar_url',
    tags: 'tags', notes: 'notes', customFields: 'custom_fields',
  };

  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });
  vals.push(contactId, workspaceId);

  const r = await query(
    `UPDATE contacts SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
  return r.rows[0];
}

async function remove(contactId, workspaceId) {
  const r = await query(
    'DELETE FROM contacts WHERE id = $1 AND workspace_id = $2 RETURNING id',
    [contactId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Contato não encontrado'), { status: 404 });
}

module.exports = { list, getById, create, update, remove };
