'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./pipelines.service');

const router = Router({ mergeParams: true });

// GET /workspaces/:wsId/pipelines
router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.listPipelines(req.params.workspaceId));
  } catch (err) { next(err); }
});

// POST /workspaces/:wsId/pipelines
router.post('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'name é obrigatório' });
    const pipeline = await svc.createPipeline(req.params.workspaceId, req.body);
    res.status(201).json(pipeline);
  } catch (err) { next(err); }
});

// GET /workspaces/:wsId/pipelines/:pipelineId
router.get('/:pipelineId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const pipeline = await svc.getPipeline(req.params.pipelineId, req.params.workspaceId);
    if (!pipeline) return res.status(404).json({ error: 'Funil não encontrado' });
    res.json(pipeline);
  } catch (err) { next(err); }
});

// PUT /workspaces/:wsId/pipelines/:pipelineId
router.put('/:pipelineId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const pipeline = await svc.updatePipeline(req.params.pipelineId, req.params.workspaceId, req.body);
    res.json(pipeline);
  } catch (err) { next(err); }
});

// DELETE /workspaces/:wsId/pipelines/:pipelineId
router.delete('/:pipelineId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.removePipeline(req.params.pipelineId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /workspaces/:wsId/pipelines/:pipelineId/stages
router.post('/:pipelineId/stages', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'name é obrigatório' });
    const stage = await svc.createStage(req.params.workspaceId, req.params.pipelineId, req.body);
    res.status(201).json(stage);
  } catch (err) { next(err); }
});

// PUT /workspaces/:wsId/pipelines/:pipelineId/stages/:stageId
router.put('/:pipelineId/stages/:stageId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const stage = await svc.updateStage(req.params.stageId, req.params.workspaceId, req.body);
    res.json(stage);
  } catch (err) { next(err); }
});

// DELETE /workspaces/:wsId/pipelines/:pipelineId/stages/:stageId
router.delete('/:pipelineId/stages/:stageId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.removeStage(req.params.stageId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
