'use strict';

const { query } = require('../../config/database');

/**
 * Summary metrics for the workspace.
 */
async function getSummary(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `SELECT
       COUNT(*)                                                    AS total_conversations,
       COUNT(*) FILTER (WHERE status = 'resolved')                AS resolved,
       COUNT(*) FILTER (WHERE status = 'open')                    AS open,
       COUNT(*) FILTER (WHERE status = 'pending')                 AS pending,
       AVG(response_time_seconds) FILTER (WHERE response_time_seconds IS NOT NULL) AS avg_response_time_seconds,
       COUNT(*) FILTER (WHERE sla_breached = true)                AS sla_breached_count,
       AVG(csat_rating) FILTER (WHERE csat_rating IS NOT NULL)    AS avg_csat
     FROM conversations
     WHERE workspace_id = $1
       AND created_at BETWEEN $2 AND $3`,
    [workspaceId, start, end]
  );

  const msgR = await query(
    `SELECT COUNT(*) AS total_messages
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.workspace_id = $1
       AND m.created_at BETWEEN $2 AND $3`,
    [workspaceId, start, end]
  );

  return {
    ...r.rows[0],
    total_messages: msgR.rows[0].total_messages,
  };
}

/**
 * Per-agent performance metrics.
 */
async function getAgentPerformance(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `SELECT
       u.id,
       u.name,
       u.avatar_url,
       COUNT(c.id)::int                                                         AS total_conversations,
       COUNT(c.id) FILTER (WHERE c.status = 'resolved')::int                   AS resolved,
       AVG(c.response_time_seconds) FILTER (WHERE c.response_time_seconds IS NOT NULL) AS avg_response_time_seconds,
       AVG(c.csat_rating) FILTER (WHERE c.csat_rating IS NOT NULL)             AS avg_csat,
       COUNT(m.id) FILTER (WHERE m.direction = 'outbound')::int                AS messages_sent
     FROM users u
     JOIN workspace_memberships wm ON wm.user_id = u.id AND wm.workspace_id = $1
     LEFT JOIN conversations c
       ON c.assignee_id = u.id AND c.workspace_id = $1
       AND c.created_at BETWEEN $2 AND $3
     LEFT JOIN messages m
       ON m.sender_id = u.id AND m.conversation_id = c.id
     GROUP BY u.id, u.name, u.avatar_url
     ORDER BY total_conversations DESC`,
    [workspaceId, start, end]
  );

  return r.rows;
}

/**
 * Conversation volume by day.
 */
async function getVolumeByDay(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `SELECT
       DATE(created_at) AS date,
       COUNT(*)::int    AS total,
       COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved
     FROM conversations
     WHERE workspace_id = $1
       AND created_at BETWEEN $2 AND $3
     GROUP BY DATE(created_at)
     ORDER BY date`,
    [workspaceId, start, end]
  );

  return r.rows;
}

module.exports = { getSummary, getAgentPerformance, getVolumeByDay };
