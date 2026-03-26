'use strict';

const cron    = require('node-cron');
const { query } = require('../config/database');
const aiSvc   = require('../services/ai.service');
const msgSvc  = require('../modules/messages/messages.service');
const logger  = require('../utils/logger');

// ── Business hours helpers ─────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function isWithinBusinessHours(businessHours) {
  if (!businessHours?.enabled) return true;

  const tz       = businessHours.timezone || 'America/Sao_Paulo';
  const now      = new Date();
  const tzDate   = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const dayName  = DAY_NAMES[tzDate.getDay()];
  const dayConf  = businessHours[dayName];

  if (!dayConf?.enabled) return false;

  const [openH,  openM]  = dayConf.open.split(':').map(Number);
  const [closeH, closeM] = dayConf.close.split(':').map(Number);

  const currentMinutes = tzDate.getHours() * 60 + tzDate.getMinutes();
  const openMinutes    = openH  * 60 + openM;
  const closeMinutes   = closeH * 60 + closeM;

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

// ── Follow-up job ──────────────────────────────────────────────────────────

async function runFollowUp(trigger) {
  const intervals = {
    '30min': { minutes: 30,   max: 90   },
    '1day':  { minutes: 1440, max: 1560 },
    '3day':  { minutes: 4320, max: 4440 },
  };

  const { minutes, max } = intervals[trigger];

  const wsRes = await query(
    `SELECT id, anthropic_api_key, openai_api_key, ai_provider, ai_model, business_hours, follow_up_enabled
     FROM workspaces
     WHERE follow_up_enabled = true
       AND (anthropic_api_key IS NOT NULL OR openai_api_key IS NOT NULL)`
  );

  for (const ws of wsRes.rows) {
    if (!isWithinBusinessHours(ws.business_hours)) {
      logger.debug('Follow-up skipped: outside business hours', { workspaceId: ws.id });
      continue;
    }

    const convRes = await query(
      `SELECT c.id, c.workspace_id, c.assignee_id
       FROM conversations c
       WHERE c.workspace_id = $1
         AND c.status = 'open'
         AND c.last_inbound_at IS NOT NULL
         AND c.last_inbound_at <= NOW() - ($2 * INTERVAL '1 minute')
         AND c.last_inbound_at >= NOW() - ($3 * INTERVAL '1 minute')
         AND NOT EXISTS (
           SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id
             AND m.direction = 'outbound'
             AND m.is_private = false
             AND m.created_at > c.last_inbound_at
         )
         AND NOT EXISTS (
           SELECT 1 FROM follow_up_logs fl
           WHERE fl.conversation_id = c.id
             AND fl.trigger_type = $4
             AND fl.sent_at > NOW() - interval '7 days'
         )`,
      [ws.id, minutes, max, trigger]
    );

    logger.info(`Follow-up ${trigger}: found ${convRes.rows.length} conversations`, { workspaceId: ws.id });

    for (const conv of convRes.rows) {
      try {
        const provider    = ws.ai_provider || 'anthropic';
        const apiKey      = provider === 'openai' ? ws.openai_api_key : ws.anthropic_api_key;
        const messageText = await aiSvc.generateFollowUp(conv.id, trigger, apiKey, provider, ws.ai_model || null);
        if (!messageText) continue;

        await msgSvc.send(conv.id, conv.assignee_id || null, {
          content: messageText, messageType: 'text',
        });

        await query(
          `INSERT INTO follow_up_logs
             (conversation_id, workspace_id, trigger_type, message_content, status)
           VALUES ($1,$2,$3,$4,'sent')`,
          [conv.id, ws.id, trigger, messageText]
        );

        logger.info('Follow-up sent', { conversationId: conv.id, trigger });
      } catch (err) {
        await query(
          `INSERT INTO follow_up_logs
             (conversation_id, workspace_id, trigger_type, message_content, status, error_message)
           VALUES ($1,$2,$3,'','failed',$4)`,
          [conv.id, ws.id, trigger, err.message]
        ).catch(() => {});

        logger.warn('Follow-up failed', { conversationId: conv.id, trigger, err: err.message });
      }
    }
  }
}

// ── AI Analysis job ────────────────────────────────────────────────────────

async function runAiAnalysis() {
  const r = await query(
    `SELECT d.id, d.workspace_id
     FROM deals d
     JOIN workspaces w ON w.id = d.workspace_id
     WHERE w.ai_analysis_enabled = true
       AND (w.anthropic_api_key IS NOT NULL OR w.openai_api_key IS NOT NULL)
       AND d.conversation_id IS NOT NULL
       AND (d.ai_analyzed_at IS NULL OR d.ai_analyzed_at < NOW() - interval '30 minutes')
     ORDER BY d.updated_at DESC
     LIMIT 20`
  );

  for (const deal of r.rows) {
    try {
      await aiSvc.analyzeDeal(deal.id, deal.workspace_id);
      logger.debug('AI analysis completed', { dealId: deal.id });
    } catch (err) {
      logger.warn('AI analysis failed', { dealId: deal.id, err: err.message });
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ── SLA breach detection ───────────────────────────────────────────────────

async function runSlaCheck() {
  // Find workspaces with SLA configured
  const wsRes = await query(
    `SELECT id, sla_response_minutes FROM workspaces
     WHERE sla_response_minutes IS NOT NULL AND sla_response_minutes > 0`
  );

  for (const ws of wsRes.rows) {
    await query(
      `UPDATE conversations
       SET sla_breached = true
       WHERE workspace_id = $1
         AND status = 'open'
         AND sla_breached = false
         AND first_response_at IS NULL
         AND created_at <= NOW() - ($2 * INTERVAL '1 minute')`,
      [ws.id, ws.sla_response_minutes]
    );
  }
}

// ── Schedule jobs ──────────────────────────────────────────────────────────

function startJobs() {
  // 30-minute follow-up — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runFollowUp('30min').catch(err => logger.error('followUp 30min error', { err: err.message }));
  });

  // 1-day follow-up — every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runFollowUp('1day').catch(err => logger.error('followUp 1day error', { err: err.message }));
  });

  // 3-day follow-up — every hour
  cron.schedule('0 * * * *', () => {
    runFollowUp('3day').catch(err => logger.error('followUp 3day error', { err: err.message }));
  });

  // AI analysis — every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runAiAnalysis().catch(err => logger.error('AI analysis error', { err: err.message }));
  });

  // SLA breach check — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runSlaCheck().catch(err => logger.error('SLA check error', { err: err.message }));
  });

  logger.info('Background jobs started (follow-up + AI analysis + SLA check)');
}

module.exports = { startJobs };
