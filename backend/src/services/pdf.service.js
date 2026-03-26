'use strict';

const path       = require('path');
const { query }  = require('../config/database');
const storageSvc = require('./storage.service');
const logger     = require('../utils/logger');

/**
 * Extrai texto de um PDF armazenado e salva em messages.extracted_text.
 * Opera de forma assíncrona — nunca bloqueia o fluxo principal.
 */
async function extractPdfText(messageId, mediaUrl) {
  try {
    const filename = path.basename(new URL(mediaUrl).pathname);
    const buffer   = await storageSvc.getFileBuffer(filename);

    // pdf-parse é carregado sob demanda para não falhar no boot se não instalado
    const pdfParse = require('pdf-parse');
    const data     = await pdfParse(buffer);

    // Normaliza espaços e limita a 50 000 caracteres
    const text = data.text?.replace(/\s+/g, ' ').trim();
    if (!text) return null;

    const truncated = text.slice(0, 50000);
    await query('UPDATE messages SET extracted_text = $1 WHERE id = $2', [truncated, messageId]);
    logger.debug('PDF text extracted', { messageId, chars: truncated.length });
    return truncated;
  } catch (err) {
    logger.warn('PDF text extraction failed', { messageId, err: err.message });
    return null;
  }
}

module.exports = { extractPdfText };
