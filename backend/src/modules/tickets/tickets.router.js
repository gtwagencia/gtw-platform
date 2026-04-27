'use strict';

const { Router } = require('express');
const { authenticate }     = require('../../middleware/auth');
const { workspaceContext } = require('../../middleware/workspaceContext');
const svc = require('./tickets.service');

const router = Router({ mergeParams: true });

const auth = [authenticate, workspaceContext];

// ── Helper: check board access & optional manager role ────────────────────────

async function requireBoardAccess(req, res, next, requireManager = false) {
  try {
    const { boardId } = req.params;
    const userId = req.user.sub;
    const workspaceRole = req.workspaceRole;

    // Workspace admins have full access
    if (['admin', 'owner'].includes(workspaceRole) || req.user.isSuperAdmin) return next();

    const role = await svc.getBoardRole(boardId, userId);
    if (!role) return res.status(403).json({ error: 'Sem acesso a este board' });
    if (requireManager && role !== 'manager') {
      return res.status(403).json({ error: 'Apenas managers podem fazer isso' });
    }
    req.boardRole = role;
    next();
  } catch (err) { next(err); }
}

// ── Feature toggle ────────────────────────────────────────────────────────────

router.get('/enabled', ...auth, async (req, res, next) => {
  try {
    const enabled = await svc.isTicketsEnabled(req.params.workspaceId);
    res.json({ enabled });
  } catch (err) { next(err); }
});

router.put('/enabled', ...auth, async (req, res, next) => {
  try {
    if (!['admin', 'owner'].includes(req.workspaceRole) && !req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'Apenas admins podem alterar isso' });
    }
    await svc.setTicketsEnabled(req.params.workspaceId, !!req.body.enabled);
    res.json({ enabled: !!req.body.enabled });
  } catch (err) { next(err); }
});

// ── Boards ────────────────────────────────────────────────────────────────────

router.get('/boards', ...auth, async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'owner'].includes(req.workspaceRole) || req.user.isSuperAdmin;
    const boards = isAdmin
      ? await svc.listAllBoards(req.params.workspaceId)
      : await svc.listBoards(req.params.workspaceId, req.user.sub);
    res.json(boards);
  } catch (err) { next(err); }
});

router.post('/boards', ...auth, async (req, res, next) => {
  try {
    const { name, description, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const board = await svc.createBoard(req.params.workspaceId, req.user.sub, { name, description, color });
    res.status(201).json(board);
  } catch (err) { next(err); }
});

// POST /boards/:boardId/duplicate — duplica o board (colunas + tickets)
router.post('/boards/:boardId/duplicate', ...auth,
  (req, res, next) => requireBoardAccess(req, res, next, true),
  async (req, res, next) => {
    try {
      const newName = req.body.name?.trim() || undefined;
      const board = await svc.duplicateBoard(
        req.params.boardId, req.params.workspaceId, req.user.sub, newName
      );
      res.status(201).json(board);
    } catch (err) { next(err); }
  }
);

router.get('/boards/:boardId', ...auth, (req, res, next) => requireBoardAccess(req, res, next, false), async (req, res, next) => {
  try {
    const board = await svc.getBoard(req.params.boardId, req.params.workspaceId);
    res.json(board);
  } catch (err) { next(err); }
});

router.put('/boards/:boardId', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    const board = await svc.updateBoard(req.params.boardId, req.params.workspaceId, req.body);
    res.json(board);
  } catch (err) { next(err); }
});

router.delete('/boards/:boardId', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    await svc.archiveBoard(req.params.boardId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Board members ─────────────────────────────────────────────────────────────

router.get('/boards/:boardId/members', ...auth, (req, res, next) => requireBoardAccess(req, res, next, false), async (req, res, next) => {
  try {
    const members = await svc.listBoardMembers(req.params.boardId);
    res.json(members);
  } catch (err) { next(err); }
});

router.post('/boards/:boardId/members', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
    const member = await svc.addBoardMember(req.params.boardId, userId, role || 'member');
    res.status(201).json(member);
  } catch (err) { next(err); }
});

router.put('/boards/:boardId/members/:userId', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role é obrigatório' });
    const member = await svc.updateBoardMemberRole(req.params.boardId, req.params.userId, role);
    res.json(member);
  } catch (err) { next(err); }
});

router.delete('/boards/:boardId/members/:userId', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    await svc.removeBoardMember(req.params.boardId, req.params.userId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Columns ───────────────────────────────────────────────────────────────────

router.post('/boards/:boardId/columns', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    const { name, color, position, isDone } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const col = await svc.createColumn(req.params.boardId, { name, color, position, isDone });
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('column:created', {
      ...col, boardId: req.params.boardId, _userId: req.user.sub,
    });
    res.status(201).json(col);
  } catch (err) { next(err); }
});

router.put('/boards/:boardId/columns/reorder', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds deve ser array' });
    await svc.reorderColumns(req.params.boardId, orderedIds);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('columns:reordered', {
      boardId: req.params.boardId, orderedIds, _userId: req.user.sub,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.put('/boards/:boardId/columns/:columnId', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    const col = await svc.updateColumn(req.params.columnId, req.params.boardId, req.body);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('column:updated', {
      ...col, boardId: req.params.boardId, _userId: req.user.sub,
    });
    res.json(col);
  } catch (err) { next(err); }
});

router.delete('/boards/:boardId/columns/:columnId', ...auth, (req, res, next) => requireBoardAccess(req, res, next, true), async (req, res, next) => {
  try {
    await svc.deleteColumn(req.params.columnId, req.params.boardId);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('column:deleted', {
      columnId: req.params.columnId, boardId: req.params.boardId, _userId: req.user.sub,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Tickets ───────────────────────────────────────────────────────────────────

router.post('/boards/:boardId/tickets', ...auth, (req, res, next) => requireBoardAccess(req, res, next, false), async (req, res, next) => {
  try {
    const { columnId, title } = req.body;
    if (!columnId || !title) return res.status(400).json({ error: 'columnId e title são obrigatórios' });
    const ticket = await svc.createTicket(req.params.boardId, req.user.sub, req.body);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('ticket:created', { ...ticket, _userId: req.user.sub });
    res.status(201).json(ticket);
  } catch (err) { next(err); }
});

// Create ticket from conversation
router.post('/boards/:boardId/tickets/from-conversation', ...auth, (req, res, next) => requireBoardAccess(req, res, next, false), async (req, res, next) => {
  try {
    const { conversationId, contactId, contactName, columnId, assigneeId, priority, title, description } = req.body;
    if (!conversationId) return res.status(400).json({ error: 'conversationId é obrigatório' });
    const ticket = await svc.createTicketFromConversation(
      req.params.workspaceId, req.user.sub,
      { boardId: req.params.boardId, columnId, conversationId, contactId, contactName, title, description, assigneeId, priority }
    );
    res.status(201).json(ticket);
  } catch (err) { next(err); }
});

router.get('/tickets/:ticketId', ...auth, async (req, res, next) => {
  try {
    const ticket = await svc.getTicket(req.params.ticketId, req.params.workspaceId);
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    // Verifica se o usuário tem acesso ao board (via membership ou workspace admin)
    const boardRole = await svc.getBoardMemberRole(ticket.board_id, req.user.sub);
    if (!boardRole && req.workspaceRole !== 'admin' && !['owner','admin'].includes(req.orgRole)) {
      return res.status(403).json({ error: 'Sem acesso a este board' });
    }
    res.json(ticket);
  } catch (err) { next(err); }
});

router.put('/tickets/:ticketId', ...auth, async (req, res, next) => {
  try {
    // Verifica se o usuário pode editar (precisa ser pelo menos member no board)
    const existing = await svc.getTicket(req.params.ticketId, req.params.workspaceId);
    if (!existing) return res.status(404).json({ error: 'Ticket não encontrado' });

    const boardRole = await svc.getBoardMemberRole(existing.board_id, req.user.sub);
    const isAdmin   = req.workspaceRole === 'admin' || ['owner','admin'].includes(req.orgRole);
    if (!isAdmin && boardRole === 'viewer') {
      return res.status(403).json({ error: 'Você não tem permissão para editar tickets neste board' });
    }
    if (!isAdmin && !boardRole) {
      return res.status(403).json({ error: 'Sem acesso a este board' });
    }

    const ticket = await svc.updateTicket(req.params.ticketId, req.params.workspaceId, req.body);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('ticket:updated', { ...ticket, _userId: req.user.sub });
    res.json(ticket);
  } catch (err) { next(err); }
});

router.delete('/tickets/:ticketId', ...auth, async (req, res, next) => {
  try {
    const existing = await svc.getTicket(req.params.ticketId, req.params.workspaceId);
    if (!existing) return res.status(404).json({ error: 'Ticket não encontrado' });

    const boardRole = await svc.getBoardMemberRole(existing.board_id, req.user.sub);
    const isAdmin   = req.workspaceRole === 'admin' || ['owner','admin'].includes(req.orgRole);
    if (!isAdmin && (!boardRole || boardRole === 'viewer')) {
      return res.status(403).json({ error: 'Sem permissão para excluir este ticket' });
    }

    const boardId = existing.board_id;
    await svc.deleteTicket(req.params.ticketId, req.params.workspaceId);
    req.app.get('io')?.to(`ws:${req.params.workspaceId}`).emit('ticket:deleted', {
      ticketId: req.params.ticketId, boardId, _userId: req.user.sub,
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Time logs ─────────────────────────────────────────────────────────────────

router.get('/tickets/:ticketId/time-logs', ...auth, async (req, res, next) => {
  try {
    const logs = await svc.getTimeLogs(req.params.ticketId);
    const active = await svc.getActiveTimer(req.params.ticketId, req.user.sub);
    res.json({ logs, active });
  } catch (err) { next(err); }
});

router.post('/tickets/:ticketId/time-logs/start', ...auth, async (req, res, next) => {
  try {
    const log = await svc.startTimer(req.params.ticketId, req.user.sub);
    res.status(201).json(log);
  } catch (err) { next(err); }
});

router.post('/tickets/:ticketId/time-logs/stop', ...auth, async (req, res, next) => {
  try {
    const log = await svc.stopTimer(req.params.ticketId, req.user.sub);
    res.json(log || { stopped: false });
  } catch (err) { next(err); }
});

router.post('/tickets/:ticketId/time-logs', ...auth, async (req, res, next) => {
  try {
    const { startedAt, endedAt, durationSeconds, note } = req.body;
    if (!startedAt) return res.status(400).json({ error: 'startedAt é obrigatório' });
    const log = await svc.addManualTime(req.params.ticketId, req.user.sub, { startedAt, endedAt, durationSeconds, note });
    res.status(201).json(log);
  } catch (err) { next(err); }
});

router.delete('/tickets/:ticketId/time-logs/:logId', ...auth, async (req, res, next) => {
  try {
    await svc.deleteTimeLog(req.params.logId, req.user.sub);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Reminders ─────────────────────────────────────────────────────────────────

router.get('/tickets/:ticketId/reminders', ...auth, async (req, res, next) => {
  try {
    res.json(await svc.listReminders(req.params.ticketId));
  } catch (err) { next(err); }
});

router.post('/tickets/:ticketId/reminders', ...auth, async (req, res, next) => {
  try {
    const { remindAt, message } = req.body;
    if (!remindAt) return res.status(400).json({ error: 'remindAt é obrigatório' });
    const reminder = await svc.createReminder(req.params.ticketId, req.user.sub, { remindAt, message });
    res.status(201).json(reminder);
  } catch (err) { next(err); }
});

router.delete('/tickets/:ticketId/reminders/:reminderId', ...auth, async (req, res, next) => {
  try {
    await svc.deleteReminder(req.params.reminderId, req.user.sub);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Labels ────────────────────────────────────────────────────────────────────

router.get('/labels', ...auth, async (req, res, next) => {
  try {
    res.json(await svc.listLabels(req.params.workspaceId));
  } catch (err) { next(err); }
});

router.post('/labels', ...auth, async (req, res, next) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    const label = await svc.createLabel(req.params.workspaceId, { name, color });
    res.status(201).json(label);
  } catch (err) { next(err); }
});

router.delete('/labels/:labelId', ...auth, async (req, res, next) => {
  try {
    await svc.deleteLabel(req.params.labelId, req.params.workspaceId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── My Tasks ──────────────────────────────────────────────────────────────────

router.get('/my-tasks', ...auth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const tasks = await svc.getMyTasks(req.params.workspaceId, req.user.sub, { status });
    res.json(tasks);
  } catch (err) { next(err); }
});

// ── Calendar ──────────────────────────────────────────────────────────────────

router.get('/calendar', ...auth, async (req, res, next) => {
  try {
    const { from, to, myOnly } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from e to são obrigatórios' });
    const tickets = await svc.getCalendarTickets(req.params.workspaceId, req.user.sub, {
      from, to, myOnly: myOnly === 'true',
    });
    res.json(tickets);
  } catch (err) { next(err); }
});

// ── Reports ───────────────────────────────────────────────────────────────────

router.get('/reports', ...auth, async (req, res, next) => {
  try {
    const { from, to, boardId } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from e to são obrigatórios' });
    const report = await svc.getResolutionReport(req.params.workspaceId, { from, to, boardId });
    res.json(report);
  } catch (err) { next(err); }
});

module.exports = router;
