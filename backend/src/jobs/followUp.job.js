'use strict';

const cron    = require('node-cron');
const { query } = require('../config/database');
const aiSvc   = require('../services/ai.service');
const msgSvc  = require('../modules/messages/messages.service');
const logger  = require('../utils/logger');

// ── Business hours helpers ─────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

/**
 * Check if the current time is within business hours for a workspace.
 * businessHours format:
 * {
 *   enabled: true,
 *   timezone: "America/Sao_Paulo",
 *   monday: { open: "08:00", close: "18:00", enabled: true },
 *   ...
 * }
 */
function isWithinBusinessHours(businessHours) {
  if (!businessHours?.enabled) return true; // if not configured, allow anytime

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

// ── Follow-up triggers ─────────────────────────────────────────────────────

/**
 * Find stalled conversations and send follow-up messages.
 * trigger: '30min' | '1day' | '3day'
 */
async function runFollowUp(trigger) {
  const intervals = {
    '30min': { minutes: 30,   max: 90   },  // 30–90 min ago
    '1day':  { minutes: 1440, max: 1560 },  // 23–26 hours ago
    '3day':  { minutes: 4320, max: 4440 },  // 71–74 hours ago
  };

  const { minutes, max } = intervals[trigger];

  // Find workspaces with follow-up enabled
  const wsRes = await query(
    `SELECT id, anthropic_api_key, business_hours, follow_up_enabled
     FROM workspaces
     WHERE follow_up_enabled = true AND anthropic_api_key IS NOT NULL`
  );

  for (const ws of wsRes.rows) {
    // Check business hours
    if (!isWithinBusinessHours(ws.business_hours)) {
      logger.debug('Follow-up skipped: outside business hours', { workspaceId: ws.id });
      continue;
    }

    // Find stalled conversations (inbound with no outbound response since)
    const convRes = await query(
      `SELECT c.id, c.workspace_id, c.assignee_id
       FROM conversations c
       WHERE c.workspace_id = $1
         AND c.status = 'open'
         AND c.last_inbound_at IS NOT NULL
         AND c.last_inbound_at <= NOW() - ($2 || ' minutes')::interval
         AND c.last_inbound_at >= NOW() - ($3 || ' minutes')::interval
         AND NOT EXISTS (
           SELECT 1 FROM messages m
           WHERE m.conversation_id = c.id
             AND m.direction = 'outbound'
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
        // Generate follow-up message
        const messageText = await aiSvc.generateFollowUp(conv.id, trigger, ws.anthropic_api_key);
        if (!messageText) continue;

        // Send message (as system/bot — no sender_id)
        await msgSvc.send(conv.id, conv.assignee_id || null, {
          content: messageText,
          messageType: 'text',
        });

        // Log follow-up
        await query(
          `INSERT INTO follow_up_logs
             (conversation_id, workspace_id, trigger_type, message_content, status)
           VALUES ($1,$2,$3,$4,'sent')`,
          [conv.id, ws.id, trigger, messageText]
        );

        logger.info('Follow-up sent', { conversationId: conv.id, trigger });
      } catch (err) {
        // Log failure but continue
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

/**
 * Periodically analyze deals that haven't been analyzed in the last hour.
 */
async function runAiAnalysis() {
  const r = await query(
    `SELECT d.id, d.workspace_id
     FROM deals d
     JOIN workspaces w ON w.id = d.workspace_id
     WHERE w.ai_analysis_enabled = true
       AND w.anthropic_api_key IS NOT NULL
       AND d.conversation_id IS NOT NULL
       AND (d.ai_analyzed_at IS NULL OR d.ai_analyzed_at < NOW() - interval '1 hour')
     ORDER BY d.created_at DESC
     LIMIT 20`
  );

  for (const deal of r.rows) {
    try {
      await aiSvc.analyzeDeal(deal.id, deal.workspace_id);
      logger.debug('AI analysis completed', { dealId: deal.id });
    } catch (err) {
      logger.warn('AI analysis failed', { dealId: deal.id, err: err.message });
    }
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ── Schedule jobs ──────────────────────────────────────────────────────────

function startJobs() {
  // 30-minute follow-up check — every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runFollowUp('30min').catch(err => logger.error('followUp 30min error', { err: err.message }));
  });

  // 1-day follow-up check — every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runFollowUp('1day').catch(err => logger.error('followUp 1day error', { err: err.message }));
  });

  // 3-day follow-up check — every hour
  cron.schedule('0 * * * *', () => {
    runFollowUp('3day').catch(err => logger.error('followUp 3day error', { err: err.message }));
  });

  // AI analysis — every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runAiAnalysis().catch(err => logger.error('AI analysis error', { err: err.message }));
  });

  logger.info('Background jobs started (follow-up + AI analysis)');
}

module.exports = { startJobs };
