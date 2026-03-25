'use strict';

/**
 * Abstração de storage de arquivos.
 * - Se STORAGE_ENDPOINT estiver configurado → usa MinIO/S3
 * - Caso contrário → fallback para disco local (UPLOAD_DIR)
 */

const path   = require('path');
const fs     = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand,
        CreateBucketCommand, HeadBucketCommand,
        PutBucketPolicyCommand } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

const UPLOAD_DIR    = process.env.UPLOAD_DIR    || path.join(process.cwd(), 'uploads');
const BACKEND_URL   = process.env.BACKEND_URL   || 'http://localhost:4000';
const STORAGE_ENDPOINT   = process.env.STORAGE_ENDPOINT   || null; // http://gtw-minio:9000
const STORAGE_PUBLIC_URL = process.env.STORAGE_PUBLIC_URL || null; // https://app.gtw.digital/files
const STORAGE_ACCESS_KEY = process.env.STORAGE_ACCESS_KEY || null;
const STORAGE_SECRET_KEY = process.env.STORAGE_SECRET_KEY || null;
const STORAGE_BUCKET     = process.env.STORAGE_BUCKET     || 'gtw-media';

const isS3 = !!STORAGE_ENDPOINT;

let s3 = null;
if (isS3) {
  s3 = new S3Client({
    endpoint:    STORAGE_ENDPOINT,
    region:      'us-east-1',
    credentials: { accessKeyId: STORAGE_ACCESS_KEY, secretAccessKey: STORAGE_SECRET_KEY },
    forcePathStyle: true, // required for MinIO
  });
}

// ── Ensure bucket exists on startup ───────────────────────────────────────

async function ensureBucket() {
  if (!isS3) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: STORAGE_BUCKET }));
    logger.info(`Storage bucket '${STORAGE_BUCKET}' OK`);
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: STORAGE_BUCKET }));
      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Sid: 'PublicRead', Effect: 'Allow', Principal: '*',
          Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${STORAGE_BUCKET}/*`] }],
      });
      await s3.send(new PutBucketPolicyCommand({ Bucket: STORAGE_BUCKET, Policy: policy }));
      logger.info(`Storage bucket '${STORAGE_BUCKET}' created with public read`);
    } catch (err) {
      logger.error('Failed to create storage bucket', { err: err.message });
    }
  }
}

// ── Upload file ────────────────────────────────────────────────────────────

async function uploadFile(buffer, filename, mimeType) {
  if (isS3) {
    try {
      await s3.send(new PutObjectCommand({
        Bucket:      STORAGE_BUCKET,
        Key:         filename,
        Body:        buffer,
        ContentType: mimeType || 'application/octet-stream',
      }));
      return `${STORAGE_PUBLIC_URL}/${STORAGE_BUCKET}/${filename}`;
    } catch (err) {
      logger.warn('S3 upload failed, falling back to disk', { err: err.message });
      // fall through to disk
    }
  }

  const filePath = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(filePath, buffer);
  return `${BACKEND_URL}/uploads/${filename}`;
}

// ── Get file as Buffer ─────────────────────────────────────────────────────

async function getFileBuffer(filename) {
  if (isS3) {
    try {
      const resp = await s3.send(new GetObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key:    filename,
      }));
      const chunks = [];
      for await (const chunk of resp.Body) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      logger.warn('S3 get failed, trying disk', { err: err.message });
      // fall through to disk
    }
  }

  return fs.promises.readFile(path.join(UPLOAD_DIR, filename));
}

module.exports = { ensureBucket, uploadFile, getFileBuffer };
