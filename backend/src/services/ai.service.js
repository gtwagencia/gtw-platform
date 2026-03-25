'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/database');
const logger    = require('../utils/logger');

async function getConversationMessages(conversationId, includePrivate = false) {
  const r = await query(
    `SELECT direction, content, sender_name, created_at, is_private
     FROM messages
     WHERE conversation_id = $1
       AND content IS NOT NULL AND content != ''
       ${includePrivate ? '' : "AND is_private = false"}
     ORDER BY created_at DESC
     LIMIT 30`,
    [conversationId]
  );
  return r.rows.reverse();
}

function formatTranscript(messages) {
  return messages.map(m => {
    const role = m.direction === 'outbound'
      ? `Atendente${m.sender_name ? ` (${m.sender_name})` : ''}`
      : 'Cliente';
    return `${role}: ${m.content}`;
  }).join('\n');
}

async function analyzeConversation(conversationId, apiKey) {
  const messages = await getConversationMessages(conversationId);
  if (!messages.length) return null;

  const client = new Anthropic({ apiKey });
  const transcript = formatTranscript(messages);

  const systemPrompt = `Você é um assistente de CRM que analisa conversas de WhatsApp entre atendentes e clientes.
Sua tarefa é classificar o lead em uma das seguintes etapas:
- "Novo Lead": cliente acabou de entrar em contato, ainda não foi atendido ou apenas trocou cumprimentos
- "Em Atendimento": há interação ativa, o cliente está sendo atendido, perguntas sendo respondidas
- "Qualificado para Venda": cliente demonstrou interesse real em comprar, pediu preços, demonstrou intenção clara
- "Comprou": cliente confirmou compra, pagamento realizado, negócio fechado
- "Negócio Perdido": cliente desistiu, não tem interesse, pediu para não ser mais contatado

Responda SOMENTE com um JSON no formato:
{
  "stage": "<nome exato da etapa>",
  "summary": "<resumo de 1-2 frases sobre o lead e situação atual>",
  "confidence": <número de 0 a 1>
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Analise esta conversa e classifique o lead:\n\n${transcript}` }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.warn('AI analysis failed', { conversationId, err: err.message });
    return null;
  }
}

async function generateFollowUp(conversationId, triggerType, apiKey) {
  const messages = await getConversationMessages(conversationId);

  const convRes = await query(
    `SELECT ct.name AS contact_name FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id WHERE c.id = $1`,
    [conversationId]
  );
  const contactName = convRes.rows[0]?.contact_name || 'você';
  const timeLabels  = { '30min': '30 minutos', '1day': '1 dia', '3day': '3 dias' };
  const timeLabel   = timeLabels[triggerType] || triggerType;
  const transcript  = messages.length ? formatTranscript(messages.slice(-10)) : '(sem mensagens anteriores)';

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: `Você é um assistente de vendas especializado em follow-up de leads no WhatsApp.
Você deve criar mensagens de follow-up naturais, amigáveis e não invasivas em português brasileiro.
A mensagem deve ser curta (2-4 frases), direta e despertar interesse sem ser insistente.
NÃO use emojis excessivos. Seja profissional mas caloroso.`,
      messages: [{
        role: 'user',
        content: `Contexto da conversa anterior:\n${transcript}\n\nCrie uma mensagem de follow-up para ${contactName} que não respondeu há ${timeLabel}. O objetivo é retomar o contato de forma natural.`,
      }],
    });

    return response.content[0]?.text?.trim() || null;
  } catch (err) {
    logger.warn('Follow-up generation failed', { conversationId, err: err.message });
    return null;
  }
}

/**
 * Generate a chatbot response for the last inbound message.
 */
async function generateChatbotResponse(conversationId, systemPrompt, apiKey) {
  const messages = await getConversationMessages(conversationId);
  if (!messages.length) return null;

  const client = new Anthropic({ apiKey });

  // Build alternating user/assistant message history
  const history = [];
  for (const m of messages.slice(-15)) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant';
    // Merge consecutive same-role messages
    if (history.length && history[history.length - 1].role === role) {
      history[history.length - 1].content += '\n' + (m.content || '');
    } else {
      history.push({ role, content: m.content || '' });
    }
  }

  // Must end with user message
  if (!history.length || history[history.length - 1].role !== 'user') return null;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt || 'Você é um assistente de atendimento ao cliente. Responda de forma educada, clara e concisa em português brasileiro.',
      messages: history,
    });

    return response.content[0]?.text?.trim() || null;
  } catch (err) {
    logger.warn('Chatbot response failed', { conversationId, err: err.message });
    return null;
  }
}

async function analyzeDeal(dealId, workspaceId) {
  const r = await query(
    `SELECT d.id, d.conversation_id, w.anthropic_api_key, w.ai_analysis_enabled
     FROM deals d
     JOIN workspaces w ON w.id = d.workspace_id
     WHERE d.id = $1 AND d.workspace_id = $2`,
    [dealId, workspaceId]
  );
  if (!r.rows.length) return null;

  const { conversation_id, anthropic_api_key, ai_analysis_enabled } = r.rows[0];
  if (!ai_analysis_enabled || !anthropic_api_key || !conversation_id) return null;

  const result = await analyzeConversation(conversation_id, anthropic_api_key);
  if (!result) return null;

  const stageNameMap = {
    'Novo Lead': 'Novo Lead', 'Em Atendimento': 'Em Atendimento',
    'Qualificado para Venda': 'Qualificado para Venda',
    'Comprou': 'Comprou', 'Negócio Perdido': 'Negócio Perdido',
  };

  const stageName = stageNameMap[result.stage];
  const updates   = {
    ai_qualification: result.stage,
    ai_summary:       result.summary,
    ai_analyzed_at:   new Date(),
  };

  if (stageName && result.confidence >= 0.7) {
    const stageRes = await query(
      'SELECT id FROM kanban_stages WHERE workspace_id = $1 AND name = $2',
      [workspaceId, stageName]
    );
    if (stageRes.rows.length) updates.stage_id = stageRes.rows[0].id;
  }

  const fields = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
  const vals   = [...Object.values(updates), dealId, workspaceId];

  await query(
    `UPDATE deals SET ${fields.join(', ')}
     WHERE id = $${vals.length - 1} AND workspace_id = $${vals.length}`,
    vals
  );

  return { ...result, dealId };
}

module.exports = { analyzeConversation, generateFollowUp, generateChatbotResponse, analyzeDeal };
