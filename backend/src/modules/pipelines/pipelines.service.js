'use strict';

const { pool, query } = require('../../config/database');

const DEFAULT_STAGES = [
  { name: 'Novo Lead',              color: '#6366f1', position: 0, is_default: true },
  { name: 'Em Atendimento',         color: '#f97316', position: 1, is_default: false },
  { name: 'Qualificado para Venda', color: '#eab308', position: 2, is_default: false },
  { name: 'Comprou',                color: '#22c55e', position: 3, is_default: false },
  { name: 'Negócio Perdido',        color: '#ef4444', position: 4, is_default: false },
];

async function listPipelines(workspaceId) {
  const pipelines = await query(
    `SELECT p.*,
            COALESCE(json_agg(DISTINCT pi.inbox_id) FILTER (WHERE pi.inbox_id IS NOT NULL), '[]') AS inbox_ids,
            COALESCE(json_agg(DISTINCT pd.department_id) FILTER (WHERE pd.department_id IS NOT NULL), '[]') AS department_ids
     FROM pipelines p
     LEFT JOIN pipeline_inboxes pi ON pi.pipeline_id = p.id
     LEFT JOIN pipeline_departments pd ON pd.pipeline_id = p.id
     WHERE p.workspace_id = $1
     GROUP BY p.id
     ORDER BY p.position, p.created_at`,
    [workspaceId]
  );

  const stagesRes = await query(
    `SELECT ks.*, COUNT(d.id)::int AS deal_count, COALESCE(SUM(d.value), 0) AS total_value
     FROM kanban_stages ks
     JOIN pipelines p ON p.id = ks.pipeline_id
     LEFT JOIN deals d ON d.stage_id = ks.id
     WHERE p.workspace_id = $1
     GROUP BY ks.id
     ORDER BY ks.position`,
    [workspaceId]
  );

  const stagesByPipeline = {};
  for (const s of stagesRes.rows) {
    if (!stagesByPipeline[s.pipeline_id]) stagesByPipeline[s.pipeline_id] = [];
    stagesByPipeline[s.pipeline_id].push(s);
  }

  return pipelines.rows.map(p => ({
    ...p,
    stages: stagesByPipeline[p.id] || [],
  }));
}

async function getPipeline(pipelineId, workspaceId) {
  const list = await listPipelines(workspaceId);
  return list.find(p => p.id === pipelineId) || null;
}

async function getDefaultPipeline(workspaceId) {
  const r = await query(
    `SELECT id FROM pipelines WHERE workspace_id = $1 AND is_default = true ORDER BY position LIMIT 1`,
    [workspaceId]
  );
  if (r.rows.length) return r.rows[0].id;
  // fallback: first pipeline
  const fallback = await query(
    `SELECT id FROM pipelines WHERE workspace_id = $1 ORDER BY position LIMIT 1`,
    [workspaceId]
  );
  return fallback.rows[0]?.id || null;
}

async function getPipelineForInbox(inboxId, workspaceId) {
  // First: pipeline explicitly linked to this inbox
  const r = await query(
    `SELECT p.id FROM pipelines p
     JOIN pipeline_inboxes pi ON pi.pipeline_id = p.id
     WHERE pi.inbox_id = $1 AND p.workspace_id = $2
     ORDER BY p.position LIMIT 1`,
    [inboxId, workspaceId]
  );
  if (r.rows.length) return r.rows[0].id;
  return getDefaultPipeline(workspaceId);
}

async function createPipeline(workspaceId, body) {
  const { name, description, isDefault, inboxIds = [], departmentIds = [], stages } = body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (isDefault) {
      await client.query(
        `UPDATE pipelines SET is_default = false WHERE workspace_id = $1`,
        [workspaceId]
      );
    }

    // Get next position
    const posRes = await client.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM pipelines WHERE workspace_id = $1`,
      [workspaceId]
    );
    const position = posRes.rows[0].next_pos;

    const pipelineRes = await client.query(
      `INSERT INTO pipelines (workspace_id, name, description, is_default, position)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [workspaceId, name, description || null, isDefault || false, position]
    );
    const pipeline = pipelineRes.rows[0];

    // Seed stages (custom or defaults)
    const stagesToCreate = stages?.length ? stages : DEFAULT_STAGES;
    for (const [i, s] of stagesToCreate.entries()) {
      await client.query(
        `INSERT INTO kanban_stages (workspace_id, pipeline_id, name, color, position, is_default, ai_prompt)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [workspaceId, pipeline.id, s.name, s.color || '#6366f1', i, s.is_default ?? (i === 0), s.ai_prompt || null]
      );
    }

    // Link inboxes
    for (const inboxId of inboxIds) {
      await client.query(
        `INSERT INTO pipeline_inboxes (pipeline_id, inbox_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [pipeline.id, inboxId]
      );
    }

    // Link departments
    for (const deptId of departmentIds) {
      await client.query(
        `INSERT INTO pipeline_departments (pipeline_id, department_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [pipeline.id, deptId]
      );
    }

    await client.query('COMMIT');
    return getPipeline(pipeline.id, workspaceId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updatePipeline(pipelineId, workspaceId, body) {
  const { name, description, isDefault, inboxIds, departmentIds } = body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (isDefault) {
      await client.query(
        `UPDATE pipelines SET is_default = false WHERE workspace_id = $1 AND id != $2`,
        [workspaceId, pipelineId]
      );
    }

    const fields = []; const vals = []; let idx = 1;
    if (name        !== undefined) { fields.push(`name = $${idx++}`);        vals.push(name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); vals.push(description); }
    if (isDefault   !== undefined) { fields.push(`is_default = $${idx++}`);  vals.push(isDefault); }
    if (fields.length) {
      vals.push(pipelineId, workspaceId);
      await client.query(
        `UPDATE pipelines SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = $${idx} AND workspace_id = $${idx + 1}`,
        vals
      );
    }

    if (inboxIds !== undefined) {
      await client.query(`DELETE FROM pipeline_inboxes WHERE pipeline_id = $1`, [pipelineId]);
      for (const inboxId of inboxIds) {
        await client.query(
          `INSERT INTO pipeline_inboxes (pipeline_id, inbox_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [pipelineId, inboxId]
        );
      }
    }

    if (departmentIds !== undefined) {
      await client.query(`DELETE FROM pipeline_departments WHERE pipeline_id = $1`, [pipelineId]);
      for (const deptId of departmentIds) {
        await client.query(
          `INSERT INTO pipeline_departments (pipeline_id, department_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [pipelineId, deptId]
        );
      }
    }

    await client.query('COMMIT');
    return getPipeline(pipelineId, workspaceId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function removePipeline(pipelineId, workspaceId) {
  // Prevent deleting last pipeline
  const countRes = await query(
    `SELECT COUNT(*) FROM pipelines WHERE workspace_id = $1`, [workspaceId]
  );
  if (parseInt(countRes.rows[0].count) <= 1) {
    throw Object.assign(new Error('Não é possível excluir o único funil do workspace'), { status: 400 });
  }

  // Move deals to default pipeline before deleting
  const defaultId = await getDefaultPipeline(workspaceId);
  if (defaultId && defaultId !== pipelineId) {
    await query(
      `UPDATE deals SET pipeline_id = $1 WHERE pipeline_id = $2`,
      [defaultId, pipelineId]
    );
  }

  await query(`DELETE FROM pipelines WHERE id = $1 AND workspace_id = $2`, [pipelineId, workspaceId]);
}

// Stage management within a pipeline
async function createStage(workspaceId, pipelineId, body) {
  const { name, color, position, isDefault, aiPrompt } = body;
  const posRes = await query(
    `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM kanban_stages WHERE pipeline_id = $1`,
    [pipelineId]
  );
  const pos = position ?? posRes.rows[0].next_pos;
  const r = await query(
    `INSERT INTO kanban_stages (workspace_id, pipeline_id, name, color, position, is_default, ai_prompt)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [workspaceId, pipelineId, name, color || '#6366f1', pos, isDefault || false, aiPrompt || null]
  );
  return r.rows[0];
}

async function updateStage(stageId, workspaceId, body) {
  const map = { name: 'name', color: 'color', position: 'position', isDefault: 'is_default', aiPrompt: 'ai_prompt' };
  const fields = []; const vals = []; let idx = 1;
  for (const [k, col] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${col} = $${idx++}`); vals.push(body[k]); }
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo'), { status: 400 });
  vals.push(stageId, workspaceId);
  const r = await query(
    `UPDATE kanban_stages SET ${fields.join(', ')} WHERE id = $${idx} AND workspace_id = $${idx+1} RETURNING *`,
    vals
  );
  return r.rows[0];
}

async function removeStage(stageId, workspaceId) {
  // Move deals to the first stage of the same pipeline
  const stageRes = await query(`SELECT pipeline_id FROM kanban_stages WHERE id = $1`, [stageId]);
  const pipelineId = stageRes.rows[0]?.pipeline_id;
  if (pipelineId) {
    const firstStage = await query(
      `SELECT id FROM kanban_stages WHERE pipeline_id = $1 AND id != $2 ORDER BY position LIMIT 1`,
      [pipelineId, stageId]
    );
    if (firstStage.rows.length) {
      await query(`UPDATE deals SET stage_id = $1 WHERE stage_id = $2`, [firstStage.rows[0].id, stageId]);
    }
  }
  await query(`DELETE FROM kanban_stages WHERE id = $1 AND workspace_id = $2`, [stageId, workspaceId]);
}

async function seedDefaultPipeline(workspaceId) {
  // Called from kanban.service.seedDefaultStages after stages are created
  const existing = await query(`SELECT id FROM pipelines WHERE workspace_id = $1 LIMIT 1`, [workspaceId]);
  if (existing.rows.length) return existing.rows[0].id;

  const r = await query(
    `INSERT INTO pipelines (workspace_id, name, is_default, position) VALUES ($1,'Vendas',true,0) RETURNING id`,
    [workspaceId]
  );
  const pipelineId = r.rows[0].id;

  await query(
    `UPDATE kanban_stages SET pipeline_id = $1 WHERE workspace_id = $2 AND pipeline_id IS NULL`,
    [pipelineId, workspaceId]
  );
  return pipelineId;
}

module.exports = {
  listPipelines, getPipeline, getDefaultPipeline, getPipelineForInbox,
  createPipeline, updatePipeline, removePipeline,
  createStage, updateStage, removeStage,
  seedDefaultPipeline,
};
