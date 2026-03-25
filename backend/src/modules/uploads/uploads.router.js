'use strict';

/**
 * Upload de arquivos/mídias
 * POST /api/v1/uploads  →  { url, type, name, size }
 *
 * Armazena em /app/uploads (mapeado como volume no Docker).
 * Os arquivos são servidos em /uploads/* pelo express.static no server.js.
 */

const { Router } = require('express');
const multer     = require('multer');
const path       = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../../middleware/auth');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Tipo de arquivo não permitido'), { status: 415 }));
  },
});

const router = Router();

// Garante que o diretório de uploads existe
const fs = require('fs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

router.post('/', authenticate, upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const baseUrl = process.env.BACKEND_URL
      || `${req.protocol}://${req.get('host')}`;

    const mimeType = req.file.mimetype;
    let type = 'document';
    if (mimeType.startsWith('image/'))  type = 'image';
    if (mimeType.startsWith('video/'))  type = 'video';
    if (mimeType.startsWith('audio/'))  type = 'audio';

    res.json({
      url:  `${baseUrl}/uploads/${req.file.filename}`,
      type,
      name: req.file.originalname,
      size: req.file.size,
      mime: mimeType,
    });
  } catch (err) { next(err); }
});

module.exports = router;
