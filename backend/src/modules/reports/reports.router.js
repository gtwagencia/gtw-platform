'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./reports.service');

const router = Router({ mergeParams: true });

router.get('/summary', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getSummary(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

router.get('/agents', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getAgentPerformance(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

router.get('/volume', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    res.json(await svc.getVolumeByDay(req.params.workspaceId, { startDate, endDate }));
  } catch (err) { next(err); }
});

module.exports = router;
