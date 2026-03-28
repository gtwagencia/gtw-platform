'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const { query } = require('../config/database');
const logger    = require('../utils/logger');

// ── Provider abstraction ────────────────────────────────────────────────────

// Modelos padrão por provedor
const DEFAULT_MODELS = {
  anthropic: { fast: 'claude-haiku-4-5-20251001', smart: 'claude-sonnet-4-6' },
  openai:    { fast: 'gpt-4o-mini',               smart: 'gpt-4o'            },
};

/**
 * Chama o LLM configurado no workspace (Anthropic ou OpenAI).
 * @param {object} opts
 * @param {string}  opts.provider  - 'anthropic' | 'openai'
 * @param {string}  opts.apiKey
 * @param {string}  [opts.model]   - modelo específico; usa padrão se omitido
 * @param {string}  opts.system
 * @param {{ role: string, content: string }[]} opts.messages
 * @param {number}  [opts.maxTokens]
 * @returns {Promise<string>}
 */
async function callLLM({ provider, apiKey, model, system, messages, maxTokens = 300 }) {
  if (provider === 'openai') {
    const resolvedModel = model || (maxTokens > 200 ? DEFAULT_MODELS.openai.smart : DEFAULT_MODELS.openai.fast);
    const msgs = [{ role: 'system', content: system }, ...messages];
    const resp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      { model: resolvedModel, messages: msgs, max_tokens: maxTokens },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30000 }
    );
    return resp.data.choices[0]?.message?.content?.trim() || '';
  }

  // Default: Anthropic
  const resolvedModel = model || (maxTokens > 200 ? DEFAULT_MODELS.anthropic.smart : DEFAULT_MODELS.anthropic.fast);
  const client        = new Anthropic({ apiKey });
  const response      = await client.messages.create({
    model: resolvedModel, max_tokens: maxTokens, system, messages,
  });
  return response.content[0]?.text?.trim() || '';
}

async function getConversationMessages(conversationId, includePrivate = false) {
  const r = await query(
    `SELECT m.direction, m.content, m.created_at, m.is_private, m.message_type,
            u.name AS sender_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1
       ${includePrivate ? '' : "AND m.is_private = false"}
       AND (m.content IS NOT NULL AND m.content != '' OR m.message_type != 'text')
     ORDER BY m.created_at DESC
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

    if (m.extracted_text) {
      // Limita texto do PDF a 3000 chars por mensagem para não explodir o contexto
      const preview = m.extracted_text.slice(0, 3000);
      return `${role} [PDF enviado]:\n---\n${preview}\n---`;
    }
    if (m.message_type === 'image')    return `${role}: [imagem enviada]`;
    if (m.message_type === 'audio')    return `${role}: [áudio enviado]`;
    if (m.message_type === 'video')    return `${role}: [vídeo enviado]`;
    if (m.message_type === 'document') return `${role}: [documento enviado: ${m.content || ''}]`;
    if (m.message_type === 'sticker')  return `${role}: [figurinha]`;
    return `${role}: ${m.content}`;
  }).join('\n');
}

async function analyzeConversation(conversationId, apiKey, provider = 'anthropic', model = null, stageContext = null) {
  let messages;
  try {
    messages = await getConversationMessages(conversationId);
  } catch (err) {
    logger.warn('getConversationMessages failed', { conversationId, err: err.message });
    throw Object.assign(new Error(`Erro ao buscar mensagens: ${err.message}`), { status: 400 });
  }
  if (!messages.length) {
    throw Object.assign(new Error('Conversa não tem mensagens para analisar'), { status: 400 });
  }

  const transcript   = formatTranscript(messages);
  const contextBlock = stageContext ? `\nCONTEXTO ADICIONAL DO FUNIL/ETAPA:\n${stageContext}\n` : '';
  const systemPrompt = `${contextBlock}Você é um assistente de CRM que analisa conversas de WhatsApp entre atendentes e clientes.
Sua tarefa é classificar o lead e extrair informações comerciais relevantes.

REGRA FUNDAMENTAL para classificação — leia com atenção:
- "Novo Lead": NÃO há NENHUMA mensagem de "Atendente" na conversa. O cliente entrou em contato mas nenhum atendente respondeu ainda.
- "Em Atendimento": existe AO MENOS UMA mensagem de "Atendente" na conversa, mesmo que curta ou apenas de saudação. Se o atendente respondeu qualquer coisa, já é "Em Atendimento".
- "Qualificado para Venda": o cliente demonstrou interesse real em comprar, pediu orçamento, enviou especificações ou demonstrou intenção clara de fechar negócio.
- "Comprou": cliente confirmou compra, pagamento realizado ou negócio explicitamente fechado.
- "Negócio Perdido": cliente desistiu, disse que não tem interesse, pediu para parar de ser contatado ou sumiu após proposta.

IMPORTANTE: Se você vir mensagens de "Atendente" na conversa, NUNCA classifique como "Novo Lead".

Se houver documentos PDF na conversa (orçamentos, propostas, etc.), analise o conteúdo e extraia o valor total do negócio.

Responda SOMENTE com um JSON no formato:
{
  "stage": "<nome exato da etapa>",
  "summary": "<resumo de 2-3 frases descrevendo o cliente, o que ele quer e qual é a situação atual do negócio>",
  "confidence": <número de 0 a 1>,
  "deal_value": <valor numérico em reais se encontrado em documentos, ou null>
}`;

  try {
    const text = await callLLM({
      provider, apiKey, model, system: systemPrompt, maxTokens: 300,
      messages: [{ role: 'user', content: `Analise esta conversa e classifique o lead:\n\n${transcript}` }],
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.warn('AI analysis failed', { conversationId, err: err.message });
    throw Object.assign(new Error(`Falha na API de IA: ${err.message}`), { status: 400 });
  }
}

async function generateFollowUp(conversationId, triggerType, apiKey, provider = 'anthropic', model = null) {
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

  try {
    return await callLLM({
      provider, apiKey, model, maxTokens: 200,
      system: `Você é um assistente de vendas especializado em follow-up de leads no WhatsApp.
Você deve criar mensagens de follow-up naturais, amigáveis e não invasivas em português brasileiro.
A mensagem deve ser curta (2-4 frases), direta e despertar interesse sem ser insistente.
NÃO use emojis excessivos. Seja profissional mas caloroso.`,
      messages: [{
        role: 'user',
        content: `Contexto da conversa anterior:\n${transcript}\n\nCrie uma mensagem de follow-up para ${contactName} que não respondeu há ${timeLabel}. O objetivo é retomar o contato de forma natural.`,
      }],
    }) || null;
  } catch (err) {
    logger.warn('Follow-up generation failed', { conversationId, err: err.message });
    return null;
  }
}

/**
 * Generate a chatbot response for the last inbound message.
 */
async function generateChatbotResponse(conversationId, systemPrompt, apiKey, provider = 'anthropic', model = null) {
  const messages = await getConversationMessages(conversationId);
  if (!messages.length) return null;

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
    return await callLLM({
      provider, apiKey, model, maxTokens: 300,
      system: systemPrompt || 'Você é um assistente de atendimento ao cliente. Responda de forma educada, clara e concisa em português brasileiro.',
      messages: history,
    }) || null;
  } catch (err) {
    logger.warn('Chatbot response failed', { conversationId, err: err.message });
    return null;
  }
}

async function analyzeDeal(dealId, workspaceId) {
  const r = await query(
    `SELECT d.id, d.conversation_id, d.contact_id, d.pipeline_id, d.ai_analyzed_at,
            ks.ai_prompt AS stage_ai_prompt,
            w.anthropic_api_key, w.openai_api_key, w.ai_provider, w.ai_model, w.ai_analysis_enabled,
            c.last_message_at, c.first_response_at
     FROM deals d
     JOIN workspaces w ON w.id = d.workspace_id
     LEFT JOIN kanban_stages ks ON ks.id = d.stage_id
     LEFT JOIN conversations c ON c.id = d.conversation_id
     WHERE d.id = $1 AND d.workspace_id = $2`,
    [dealId, workspaceId]
  );
  if (!r.rows.length) {
    logger.warn('analyzeDeal: deal not found', { dealId, workspaceId });
    return null;
  }

  let { conversation_id, contact_id, pipeline_id, stage_ai_prompt, anthropic_api_key, openai_api_key, ai_provider, ai_model, ai_analysis_enabled, ai_analyzed_at, last_message_at, first_response_at } = r.rows[0];

  // Se já foi analisado antes, só re-analisa se:
  // - houve mensagem nos últimos 30 minutos, OU
  // - agente ainda não respondeu (first_response_at IS NULL) — mantém análise atualizada enquanto aguarda
  if (ai_analyzed_at && last_message_at) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const hasRecentActivity = new Date(last_message_at) >= thirtyMinAgo;
    const awaitingFirstResponse = !first_response_at;
    if (!hasRecentActivity && !awaitingFirstResponse) {
      logger.debug('analyzeDeal: skipped — no recent activity and already responded', { dealId });
      return null;
    }
  }
  const provider = ai_provider || 'anthropic';
  const apiKey   = provider === 'openai' ? openai_api_key : anthropic_api_key;

  logger.info('analyzeDeal: config check', {
    dealId, workspaceId, provider,
    ai_analysis_enabled,
    hasApiKey: !!apiKey,
    conversation_id,
    contact_id,
  });

  if (!ai_analysis_enabled) {
    logger.warn('analyzeDeal: ai_analysis_enabled is false');
    return null;
  }
  if (!apiKey) {
    logger.warn('analyzeDeal: no api key configured for provider', { provider });
    return null;
  }

  // Fallback: se deal não tem conversation_id (deals antigos), busca a conversa mais recente do contato
  if (!conversation_id && contact_id) {
    const convRes = await query(
      `SELECT id FROM conversations
       WHERE workspace_id = $1 AND contact_id = $2
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT 1`,
      [workspaceId, contact_id]
    );
    if (convRes.rows.length) {
      conversation_id = convRes.rows[0].id;
      logger.info('analyzeDeal: linked conversation via contact fallback', { dealId, conversation_id });
      await query('UPDATE deals SET conversation_id = $1 WHERE id = $2', [conversation_id, dealId]);
    }
  }

  if (!conversation_id) {
    logger.warn('analyzeDeal: no conversation found for deal', { dealId, contact_id });
    return null;
  }

  const result = await analyzeConversation(conversation_id, apiKey, provider, ai_model || null, stage_ai_prompt || null);
  if (!result) throw Object.assign(new Error('IA não retornou classificação (resposta inválida)'), { status: 400 });

  // Dynamic stage name lookup from the deal's pipeline
  let stageId = null;
  if (result.stage && pipeline_id) {
    const stageRes = await query(
      `SELECT id FROM kanban_stages WHERE pipeline_id = $1 AND name = $2`,
      [pipeline_id, result.stage]
    );
    if (stageRes.rows.length && result.confidence >= 0.7) stageId = stageRes.rows[0].id;
  } else if (result.stage) {
    // Legacy: workspace-scoped stages
    const stageRes = await query(
      `SELECT id FROM kanban_stages WHERE workspace_id = $1 AND name = $2`,
      [workspaceId, result.stage]
    );
    if (stageRes.rows.length && result.confidence >= 0.7) stageId = stageRes.rows[0].id;
  }

  const updates = {
    ai_qualification: result.stage,
    ai_summary:       result.summary,
    ai_analyzed_at:   new Date(),
  };
  if (stageId) updates.stage_id = stageId;

  // Atualiza valor do deal se IA extraiu de documentos e o campo ainda está zerado
  if (result.deal_value && typeof result.deal_value === 'number' && result.deal_value > 0) {
    const dealRes = await query('SELECT value FROM deals WHERE id = $1', [dealId]);
    const currentValue = parseFloat(dealRes.rows[0]?.value || 0);
    if (currentValue === 0) updates.value = result.deal_value;
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
