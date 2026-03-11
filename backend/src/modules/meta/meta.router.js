'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const { query }            = require('../../config/database');
const svc = require('./meta.service');

const router = Router({ mergeParams: true });

// GET /workspaces/:workspaceId/meta/events — history
router.get('/events', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.listEvents(req.params.workspaceId, {
      page:  parseInt(page,  10) || 1,
      limit: parseInt(limit, 10) || 50,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// POST /workspaces/:workspaceId/meta/events — manual event trigger
router.post('/events', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { eventName, contactId, dealId } = req.body;
    if (!eventName || !contactId) {
      return res.status(400).json({ error: 'eventName e contactId são obrigatórios' });
    }

    const contactRes = await query(
      'SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2',
      [contactId, req.params.workspaceId]
    );
    if (!contactRes.rows.length) return res.status(404).json({ error: 'Contato não encontrado' });

    let deal = null;
    if (dealId) {
      const dealRes = await query('SELECT * FROM deals WHERE id = $1', [dealId]);
      deal = dealRes.rows[0] || null;
    }

    const result = await svc.sendEvent(req.workspace, {
      eventName,
      contact: contactRes.rows[0],
      deal,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// POST /workspaces/:workspaceId/meta/purchase — shortcut
router.post('/purchase', authenticate, workspaceContext, async (req, res, next) => {
  try {
    const { contactId, dealId } = req.body;
    if (!contactId || !dealId) {
      return res.status(400).json({ error: 'contactId e dealId são obrigatórios' });
    }

    const [contactRes, dealRes] = await Promise.all([
      query('SELECT * FROM contacts WHERE id = $1 AND workspace_id = $2', [contactId, req.params.workspaceId]),
      query('SELECT * FROM deals WHERE id = $1 AND workspace_id = $2',    [dealId,    req.params.workspaceId]),
    ]);

    if (!contactRes.rows.length) return res.status(404).json({ error: 'Contato não encontrado' });
    if (!dealRes.rows.length)    return res.status(404).json({ error: 'Deal não encontrado' });

    const result = await svc.sendPurchaseEvent(req.workspace, {
      contact: contactRes.rows[0],
      deal:    dealRes.rows[0],
    });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
