'use strict';

const { query } = require('../../config/database');

// ── Default stages ─────────────────────────────────────────────────────────

const DEFAULT_STAGES = [
  { name: 'Novo Lead',               color: '#6366f1', position: 0 },
  { name: 'Em Atendimento',          color: '#f97316', position: 1 },
  { name: 'Qualificado para Venda',  color: '#eab308', position: 2 },
  { name: 'Comprou',                 color: '#22c55e', position: 3 },
  { name: 'Negócio Perdido',         color: '#ef4444', position: 4 },
];

async function seedDefaultStages(workspaceId) {
  // Only seed if workspace has no stages yet
  const existing = await query(
    'SELECT id FROM kanban_stages WHERE workspace_id = $1 LIMIT 1',
    [workspaceId]
  );
  if (existing.rows.length) return;

  for (const stage of DEFAULT_STAGES) {
    await query(
      `INSERT INTO kanban_stages (workspace_id, name, color, position, is_default)
       VALUES ($1,$2,$3,$4,true)`,
      [workspaceId, stage.name, stage.color, stage.position]
    );
  }
  // Link stages to default pipeline
  await require('../pipelines/pipelines.service').seedDefaultPipeline(workspaceId);
}

// ── Stages ─────────────────────────────────────────────────────────────────

async function listStages(workspaceId, pipelineId) {
  const conds = ['ks.workspace_id = $1'];
  const params = [workspaceId];
  if (pipelineId) { params.push(pipelineId); conds.push(`ks.pipeline_id = $${params.length}`); }
  const r = await query(
    `SELECT ks.*,
            COUNT(d.id)::int          AS deal_count,
            COALESCE(SUM(d.value), 0) AS total_value
     FROM kanban_stages ks
     LEFT JOIN deals d ON d.stage_id = ks.id
     WHERE ${conds.join(' AND ')}
     GROUP BY ks.id
     ORDER BY ks.position`,
    params
  );
  return r.rows;
}

async function createStage(workspaceId, { name, color, position, isDefault }) {
  const r = await query(
    `INSERT INTO kanban_stages (workspace_id, name, color, position, is_default)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [workspaceId, name, color || '#6366f1',
      position ?? 0, isDefault ?? false]
  );
  return r.rows[0];
}

async function updateStage(stageId, workspaceId, body) {
  const map = { name: 'name', color: 'color', position: 'position', isDefault: 'is_default' };
  const fields = []; const vals = []; let idx = 1;

  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo'), { status: 400 });

  vals.push(stageId, workspaceId);
  const r = await query(
    `UPDATE kanban_stages SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  return r.rows[0];
}

async function removeStage(stageId, workspaceId) {
  await query(
    'DELETE FROM kanban_stages WHERE id = $1 AND workspace_id = $2',
    [stageId, workspaceId]
  );
}

// ── Deals ──────────────────────────────────────────────────────────────────

async function listDeals(workspaceId, { stageId, assigneeId, pipelineId, inboxId } = {}) {
  const params = [workspaceId];
  const conds  = ['d.workspace_id = $1'];

  if (stageId)    { params.push(stageId);    conds.push(`d.stage_id = $${params.length}`); }
  if (assigneeId) { params.push(assigneeId); conds.push(`COALESCE(d.assignee_id, conv.assignee_id) = $${params.length}`); }
  if (pipelineId) { params.push(pipelineId); conds.push(`d.pipeline_id = $${params.length}`); }
  if (inboxId)    { params.push(inboxId);    conds.push(`conv.inbox_id = $${params.length}`); }

  const r = await query(
    `SELECT d.*,
            c.name        AS contact_name,
            c.phone       AS contact_phone,
            c.avatar_url  AS contact_avatar,
            u.name        AS assignee_name,
            u.avatar_url  AS assignee_avatar,
            ks.name       AS stage_name,
            ks.color      AS stage_color,
            conv.status         AS conv_status,
            conv.assignee_id    AS conv_assignee_id,
            conv.inbox_id       AS conv_inbox_id,
            conv.response_time_seconds,
            conv.last_inbound_at,
            conv.unread_count
     FROM deals d
     JOIN contacts c ON c.id = d.contact_id
     JOIN kanban_stages ks ON ks.id = d.stage_id
     LEFT JOIN conversations conv ON conv.id = d.conversation_id
     LEFT JOIN users u ON u.id = COALESCE(d.assignee_id, conv.assignee_id)
     WHERE ${conds.join(' AND ')}
     ORDER BY d.created_at DESC`,
    params
  );
  return r.rows;
}

async function createDeal(workspaceId, body) {
  const { contactId, stageId, title, value, currency, priority, assigneeId, conversationId } = body;

  const r = await query(
    `INSERT INTO deals (workspace_id, contact_id, stage_id, title, value, currency, priority, assignee_id, conversation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [workspaceId, contactId, stageId, title,
      value || 0, currency || 'BRL', priority || 'medium',
      assigneeId || null, conversationId || null]
  );
  return r.rows[0];
}

async function createDealFromConversation(workspaceId, { contactId, contactName, conversationId, assigneeId, inboxId }) {
  const pipelineSvc = require('../pipelines/pipelines.service');
  const pipelineId  = inboxId
    ? await pipelineSvc.getPipelineForInbox(inboxId, workspaceId)
    : await pipelineSvc.getDefaultPipeline(workspaceId);

  const stageRes = await query(
    `SELECT id FROM kanban_stages
     WHERE workspace_id = $1 AND is_default = true
       ${pipelineId ? 'AND pipeline_id = $2' : ''}
     ORDER BY position LIMIT 1`,
    pipelineId ? [workspaceId, pipelineId] : [workspaceId]
  );
  if (!stageRes.rows.length) {
    const fallback = await query(
      `SELECT id FROM kanban_stages WHERE workspace_id = $1 ${pipelineId ? 'AND pipeline_id = $2' : ''} ORDER BY position LIMIT 1`,
      pipelineId ? [workspaceId, pipelineId] : [workspaceId]
    );
    if (!fallback.rows.length) return null;
    stageRes.rows.push(fallback.rows[0]);
  }

  const stageId = stageRes.rows[0].id;

  // Avoid duplicate deals for same conversation
  const existing = await query(
    'SELECT id FROM deals WHERE conversation_id = $1',
    [conversationId]
  );
  if (existing.rows.length) return existing.rows[0];

  const r = await query(
    `INSERT INTO deals (workspace_id, contact_id, stage_id, pipeline_id, title, conversation_id, assignee_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [workspaceId, contactId, stageId, pipelineId || null, contactName || 'Novo Lead', conversationId, assigneeId || null]
  );
  return r.rows[0];
}

async function updateDeal(dealId, workspaceId, body) {
  const map = {
    stageId:          'stage_id',
    title:            'title',
    value:            'value',
    currency:         'currency',
    priority:         'priority',
    assigneeId:       'assignee_id',
    lostReason:       'lost_reason',
    closedAt:         'closed_at',
    conversationId:   'conversation_id',
    aiQualification:  'ai_qualification',
    aiSummary:        'ai_summary',
    aiAnalyzedAt:     'ai_analyzed_at',
  };
  const fields = []; const vals = []; let idx = 1;

  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k] ?? null); }
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo'), { status: 400 });

  vals.push(dealId, workspaceId);
  const r = await query(
    `UPDATE deals SET ${fields.join(', ')}
     WHERE id = $${idx} AND workspace_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Deal não encontrado'), { status: 404 });
  return r.rows[0];
}

async function removeDeal(dealId, workspaceId) {
  await query('DELETE FROM deals WHERE id = $1 AND workspace_id = $2', [dealId, workspaceId]);
}

// Board view — stages + their deals
async function getBoard(workspaceId, { pipelineId, assigneeId, inboxId } = {}) {
  const pipelineSvc = require('../pipelines/pipelines.service');
  const resolvedPipelineId = pipelineId || await pipelineSvc.getDefaultPipeline(workspaceId);

  const stages = await listStages(workspaceId, resolvedPipelineId);
  const deals  = await listDeals(workspaceId, { pipelineId: resolvedPipelineId, assigneeId, inboxId });

  return stages.map(stage => ({
    ...stage,
    deals: deals.filter(d => d.stage_id === stage.id),
  }));
}

/**
 * Move o deal de "Novo Lead" para "Em Atendimento" quando um agente responde.
 * Só avança — nunca retrocede de Qualificado/Comprou/etc.
 * Depois dispara análise de IA de forma assíncrona (se habilitada no workspace).
 */
async function moveToAttending(conversationId) {
  const r = await query(
    `UPDATE deals
     SET stage_id = sub.em_atendimento_id, updated_at = NOW()
     FROM (
       SELECT d.id AS deal_id, d.workspace_id,
              atend.id AS em_atendimento_id
       FROM deals d
       JOIN kanban_stages novo  ON novo.id = (
         SELECT id FROM kanban_stages
         WHERE (pipeline_id = d.pipeline_id OR (pipeline_id IS NULL AND workspace_id = d.workspace_id))
           AND name = 'Novo Lead' ORDER BY position LIMIT 1
       )
       JOIN kanban_stages atend ON atend.id = (
         SELECT id FROM kanban_stages
         WHERE (pipeline_id = d.pipeline_id OR (pipeline_id IS NULL AND workspace_id = d.workspace_id))
           AND name = 'Em Atendimento' ORDER BY position LIMIT 1
       )
       WHERE d.conversation_id = $1 AND d.stage_id = novo.id
     ) sub
     WHERE deals.id = sub.deal_id
     RETURNING deals.id AS deal_id, deals.workspace_id`,
    [conversationId]
  );

  if (r.rows.length) {
    const aiSvc = require('../../services/ai.service');
    for (const row of r.rows) {
      aiSvc.analyzeDeal(row.deal_id, row.workspace_id).catch(() => {});
    }
  }
}

module.exports = {
  seedDefaultStages,
  listStages, createStage, updateStage, removeStage,
  listDeals, createDeal, createDealFromConversation, updateDeal, removeDeal,
  getBoard, moveToAttending,
};
