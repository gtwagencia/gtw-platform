'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const { initDatabase } = require('./config/database');
const logger           = require('./utils/logger');
const { startJobs }    = require('./jobs/followUp.job');

const authRouter          = require('./modules/auth/auth.router');
const orgsRouter          = require('./modules/organizations/organizations.router');
const workspacesRouter    = require('./modules/workspaces/workspaces.router');
const inboxesRouter       = require('./modules/inboxes/inboxes.router');
const contactsRouter      = require('./modules/contacts/contacts.router');
const conversationsRouter = require('./modules/conversations/conversations.router');
const messagesRouter      = require('./modules/messages/messages.router');
const webhooksRouter      = require('./modules/webhooks/webhooks.router');
const metaRouter          = require('./modules/meta/meta.router');
const kanbanRouter        = require('./modules/kanban/kanban.router');
const departmentsRouter   = require('./modules/departments/departments.router');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
});

app.set('io', io);

// ── Security & parsing ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/v1/auth/login',    authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',                                    authRouter);
app.use('/api/v1/orgs',                                    orgsRouter);
app.use('/api/v1/orgs/:orgId/workspaces',                  workspacesRouter);
app.use('/api/v1/workspaces/:workspaceId/inboxes',         inboxesRouter);
app.use('/api/v1/workspaces/:workspaceId/contacts',        contactsRouter);
app.use('/api/v1/workspaces/:workspaceId/conversations',   conversationsRouter);
app.use('/api/v1/workspaces/:workspaceId/kanban',          kanbanRouter);
app.use('/api/v1/conversations/:conversationId/messages',  messagesRouter);
app.use('/api/v1/webhooks',                                webhooksRouter);
app.use('/api/v1/workspaces/:workspaceId/meta',            metaRouter);
app.use('/api/v1/workspaces/:workspaceId/departments',    departmentsRouter);

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ───────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error(err.message, { stack: err.stack });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Socket.io ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.info('Socket connected', { id: socket.id });

  socket.on('join:workspace',    (id) => socket.join(`ws:${id}`));
  socket.on('join:conversation', (id) => socket.join(`conv:${id}`));
  socket.on('disconnect', () => logger.info('Socket disconnected', { id: socket.id }));
});

// ── Bootstrap ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

async function start() {
  await initDatabase();
  server.listen(PORT, () => {
    logger.info(`GTW Platform API on port ${PORT}`);
    startJobs();
  });
}

start().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
