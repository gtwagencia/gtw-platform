'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc   = require('./kanban.service');
const aiSvc = require('../../services/ai.service');

const router = Router({ mergeParams: true });

// ── Board ──────────────────────────────────────────────────────────────────
router.get('/board', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const board = await svc.getBoard(req.params.workspaceId);
    res.json(board);
  } catch (err) { next(err); }
});

// ── Stages ─────────────────────────────────────────────────────────────────
router.get('/stages', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.listStages(req.params.workspaceId));
  } catch (err) { next(err); }
});

router.post('/stages', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const stage = await svc.createStage(req.params.workspaceId, req.body);
    res.status(201).json(stage);
  } catch (err) { next(err); }
});

router.put('/stages/:stageId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const stage = await svc.updateStage(req.params.stageId, req.params.workspaceId, req.body);
    res.json(stage);
  } catch (err) { next(err); }
});

router.delete('/stages/:stageId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.removeStage(req.params.stageId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Deals ──────────────────────────────────────────────────────────────────
router.get('/deals', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { stageId, assigneeId } = req.query;
    res.json(await svc.listDeals(req.params.workspaceId, { stageId, assigneeId }));
  } catch (err) { next(err); }
});

router.post('/deals', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { contactId, stageId, title } = req.body;
    if (!contactId || !stageId || !title) {
      return res.status(400).json({ error: 'contactId, stageId e title são obrigatórios' });
    }
    const deal = await svc.createDeal(req.params.workspaceId, req.body);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('deal:created', deal);
    res.status(201).json(deal);
  } catch (err) { next(err); }
});

router.put('/deals/:dealId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const deal = await svc.updateDeal(req.params.dealId, req.params.workspaceId, req.body);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('deal:updated', deal);
    res.json(deal);
  } catch (err) { next(err); }
});

router.delete('/deals/:dealId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.removeDeal(req.params.dealId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /deals/:dealId/analyze — trigger AI analysis manually
router.post('/deals/:dealId/analyze', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { dealId, workspaceId } = req.params;
    const result = await aiSvc.analyzeDeal(dealId, workspaceId);
    if (!result) {
      // Diagnóstico: verificar o que está faltando
      const { query } = require('../../config/database');
      const r = await query(
        `SELECT d.conversation_id, d.contact_id,
                w.ai_analysis_enabled, w.ai_provider,
                (w.openai_api_key IS NOT NULL AND w.openai_api_key != '') AS has_openai,
                (w.anthropic_api_key IS NOT NULL AND w.anthropic_api_key != '') AS has_anthropic
         FROM deals d JOIN workspaces w ON w.id = d.workspace_id
         WHERE d.id = $1 AND d.workspace_id = $2`,
        [dealId, workspaceId]
      );
      const info = r.rows[0] || {};
      const provider = info.ai_provider || 'anthropic';
      const hasKey = provider === 'openai' ? info.has_openai : info.has_anthropic;
      let reason = 'Análise não disponível';
      if (!info.ai_analysis_enabled) reason = 'Análise de IA desativada nas configurações';
      else if (!hasKey) reason = `Chave API ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} não configurada`;
      else if (!info.conversation_id && !info.contact_id) reason = 'Deal sem contato ou conversa vinculada';
      else if (!info.conversation_id) reason = 'Nenhuma conversa encontrada para este contato';
      return res.status(400).json({ error: reason });
    }
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
