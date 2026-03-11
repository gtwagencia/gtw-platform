'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./departments.service');

const router = Router({ mergeParams: true });

// GET  /workspaces/:workspaceId/departments
router.get('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.list(req.params.workspaceId));
  } catch (err) { next(err); }
});

// POST /workspaces/:workspaceId/departments
router.post('/', authenticate, workspaceContext, async (req, res, next) => {
  try {
    if (req.workspaceRole !== 'admin' && !req.user.isSuperAdmin && !['owner','admin'].includes(req.orgRole)) {
      return res.status(403).json({ error: 'Apenas admins podem criar departamentos' });
    }
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const dept = await svc.create(req.params.workspaceId, req.body);
    res.status(201).json(dept);
  } catch (err) { next(err); }
});

// PUT /workspaces/:workspaceId/departments/:deptId
router.put('/:deptId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const dept = await svc.update(req.params.deptId, req.params.workspaceId, req.body);
    res.json(dept);
  } catch (err) { next(err); }
});

// DELETE /workspaces/:workspaceId/departments/:deptId
router.delete('/:deptId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.remove(req.params.deptId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Agents ─────────────────────────────────────────────────────────────────

// GET  /workspaces/:workspaceId/departments/:deptId/agents
router.get('/:deptId/agents', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.listAgents(req.params.deptId, req.params.workspaceId));
  } catch (err) { next(err); }
});

// POST /workspaces/:workspaceId/departments/:deptId/agents
// Body: { userId }
router.post('/:deptId/agents', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
    await svc.assignAgent(req.params.deptId, req.params.workspaceId, userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /workspaces/:workspaceId/departments/:deptId/agents/:userId
router.delete('/:deptId/agents/:userId', authenticate, workspaceContext, async (req, res, next) => {
  try {
    await svc.removeAgent(req.params.workspaceId, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /workspaces/:workspaceId/departments/unassigned-agents
router.get('/unassigned-agents', authenticate, workspaceContext, async (req, res, next) => {
  try {
    res.json(await svc.listUnassignedAgents(req.params.workspaceId));
  } catch (err) { next(err); }
});

module.exports = router;
