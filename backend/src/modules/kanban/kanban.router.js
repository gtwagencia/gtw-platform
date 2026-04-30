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
    const { pipelineId, assigneeId, inboxId } = req.query;
    const board = await svc.getBoard(req.params.workspaceId, { pipelineId, assigneeId, inboxId });
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
    const { query } = require('../../config/database');

    // Carrega deal anterior para comparar stage
    const prevRes = await query('SELECT stage_id FROM deals WHERE id = $1', [req.params.dealId]);
    const prevStageId = prevRes.rows[0]?.stage_id;

    const deal = await svc.updateDeal(req.params.dealId, req.params.workspaceId, req.body);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('deal:updated', deal);

    // Se mudou de stage e nova stage tem is_purchase = true → envia Purchase ao Meta CAPI
    if (deal.stage_id && deal.stage_id !== prevStageId) {
      const stageRes = await query(
        'SELECT is_purchase FROM kanban_stages WHERE id = $1', [deal.stage_id]
      );
      if (stageRes.rows[0]?.is_purchase) {
        const wsRes = await query(
          'SELECT id, meta_pixel_id, meta_conversions_token FROM workspaces WHERE id = $1',
          [req.params.workspaceId]
        );
        const ws = wsRes.rows[0];
        if (ws?.meta_pixel_id && ws?.meta_conversions_token) {
          const metaSvc  = require('../../modules/meta/meta.service');
          const contactRes = await query('SELECT * FROM contacts WHERE id = $1', [deal.contact_id]);
          const contact    = contactRes.rows[0];
          if (contact) {
            metaSvc.sendPurchaseEvent(ws, { contact, deal }).catch(err =>
              require('../../utils/logger').warn('Meta Purchase event failed', { err: err.message, dealId: deal.id })
            );
          }
        }
      }
    }

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
    if (!result) return res.status(400).json({ error: 'Análise não disponível (verifique configurações de IA)' });
    res.json(result);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
