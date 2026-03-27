'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const jwt = require('jsonwebtoken');

const { initDatabase } = require('./config/database');
const { ensureBucket } = require('./services/storage.service');
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
const pipelinesRouter     = require('./modules/pipelines/pipelines.router');
const departmentsRouter   = require('./modules/departments/departments.router');
const cannedRouter        = require('./modules/canned-responses/canned-responses.router');
const labelsRouter        = require('./modules/labels/labels.router');
const reportsRouter       = require('./modules/reports/reports.router');
const templatesRouter     = require('./modules/templates/templates.router');
const uploadsRouter       = require('./modules/uploads/uploads.router');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
});

app.set('io', io);

// Confia no proxy Traefik para X-Forwarded-For (necessário para rate limiting)
app.set('trust proxy', 1);

// ── Static uploads ────────────────────────────────────────────────────────
const path = require('path');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// ── Security & parsing ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
const authLimiter    = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const webhookLimiter = rateLimit({ windowMs:  1 * 60 * 1000, max: 120 }); // 2 req/s por IP
const uploadLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 60  }); // 4 uploads/min
const csatLimiter    = rateLimit({ windowMs: 60 * 60 * 1000, max: 10  }); // 10 por hora
app.use('/api/v1/auth/login',             authLimiter);
app.use('/api/v1/auth/register',          authLimiter);
app.use('/api/v1/webhooks',               webhookLimiter);
app.use('/api/v1/uploads',                uploadLimiter);
app.use(/\/conversations\/.*\/csat/,      csatLimiter);

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',                                    authRouter);
app.use('/api/v1/orgs',                                    orgsRouter);
app.use('/api/v1/orgs/:orgId/workspaces',                  workspacesRouter);
app.use('/api/v1/workspaces/:workspaceId/inboxes',         inboxesRouter);
app.use('/api/v1/workspaces/:workspaceId/contacts',        contactsRouter);
app.use('/api/v1/workspaces/:workspaceId/conversations',   conversationsRouter);
app.use('/api/v1/workspaces/:workspaceId/kanban',          kanbanRouter);
app.use('/api/v1/workspaces/:workspaceId/pipelines',       pipelinesRouter);
app.use('/api/v1/workspaces/:workspaceId/departments',     departmentsRouter);
app.use('/api/v1/workspaces/:workspaceId/canned',          cannedRouter);
app.use('/api/v1/workspaces/:workspaceId/labels',          labelsRouter);
app.use('/api/v1/workspaces/:workspaceId/reports',         reportsRouter);
app.use('/api/v1/workspaces/:workspaceId/templates',       templatesRouter);
app.use('/api/v1/uploads',                                 uploadsRouter);
app.use('/api/v1/conversations/:conversationId/messages',  messagesRouter);
app.use('/api/v1/webhooks',                                webhooksRouter);
app.use('/api/v1/workspaces/:workspaceId/meta',            metaRouter);

// ── Health ─────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date() }));

// ── 404 ────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ───────────────────────────────────────────────────
const SENSITIVE_KEYS = /token|secret|password|api_key|apikey|authorization/i;
function sanitizeForLog(obj, depth = 0) {
  if (depth > 4 || typeof obj !== 'object' || !obj) return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) =>
      SENSITIVE_KEYS.test(k) ? [k, '[REDACTED]'] : [k, sanitizeForLog(v, depth + 1)]
    )
  );
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error(err.message, sanitizeForLog({ stack: err.stack, context: err.context }));
  const status = err.status || 500;
  // Never expose internal error details in production
  const message = status < 500
    ? err.message
    : (process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message);
  res.status(status).json({ error: message });
});

// ── Socket.io — JWT obrigatório no handshake ───────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  try {
    socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('AUTH_INVALID'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.data.user?.sub;
  logger.info('Socket connected', { id: socket.id, userId });

  // ── Handlers registrados SINCRONAMENTE antes de qualquer await ────────────

  // join:workspace — validado contra workspaces do usuário
  socket.on('join:workspace', async (workspaceId) => {
    try {
      const { query: dbQuery } = require('./config/database');
      const r = await dbQuery(
        `SELECT 1 FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2
         UNION
         SELECT 1 FROM users WHERE id = $2 AND is_super_admin = true`,
        [workspaceId, userId]
      );
      if (r.rows.length) socket.join(`ws:${workspaceId}`);
    } catch { /* silently ignore */ }
  });

  // join:conversation — validado contra ownership
  socket.on('join:conversation', async (conversationId) => {
    try {
      const { query: dbQuery } = require('./config/database');
      const r = await dbQuery(
        `SELECT 1 FROM conversations c
         JOIN workspace_memberships wm ON wm.workspace_id = c.workspace_id
         WHERE c.id = $1 AND wm.user_id = $2
         UNION
         SELECT 1 FROM users WHERE id = $2 AND is_super_admin = true`,
        [conversationId, userId]
      );
      if (r.rows.length) socket.join(`conv:${conversationId}`);
    } catch { /* silently ignore */ }
  });

  socket.on('disconnect', () => logger.info('Socket disconnected', { id: socket.id, userId }));

  // ── Auto-join em background (não bloqueia o registro dos handlers) ────────
  // Garante que o socket já entre nas salas dos workspaces do usuário sem
  // depender do cliente emitir join:workspace (evita race condition).
  ;(async () => {
    try {
      const { query: dbQuery } = require('./config/database');
      const isSuperAdmin = socket.data.user?.isSuperAdmin;
      const r = isSuperAdmin
        ? await dbQuery('SELECT id AS workspace_id FROM workspaces')
        : await dbQuery(
            'SELECT workspace_id FROM workspace_memberships WHERE user_id = $1',
            [userId]
          );
      for (const row of r.rows) socket.join(`ws:${row.workspace_id}`);
    } catch { /* silently ignore */ }
  })();
});

// ── Bootstrap ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

async function start() {
  await initDatabase();
  await ensureBucket();
  server.listen(PORT, () => {
    logger.info(`GTW Platform API on port ${PORT}`);
    startJobs();
  });
}

start().catch((err) => {
  logger.error('Failed to start', err);
  process.exit(1);
});
