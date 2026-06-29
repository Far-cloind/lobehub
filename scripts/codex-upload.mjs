#!/usr/bin/env node
/**
 * LobeHub Codex Upload Tool
 *
 * Uploads files to S3-compatible storage and prints markdown URLs.
 * Used by Codex to share generated images/documents with the user.
 *
 * Usage: node scripts/codex-upload.mjs <file-path> [<file-path> ...]
 *
 * The S3 credentials and endpoint are read from environment variables
 * (same as the LobeHub server configuration).
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

// ── Read S3 config from environment ──────────────────────────────────────

const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;

if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
  console.error('ERROR: S3 environment variables not set.');
  console.error('Required: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_BUCKET');
  process.exit(1);
}

const client = new S3Client({
  credentials: { accessKeyId, secretAccessKey },
  endpoint,
  forcePathStyle: process.env.S3_ENABLE_PATH_STYLE === '1',
  region: process.env.S3_REGION || 'us-east-1',
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const isPathStyle = process.env.S3_ENABLE_PATH_STYLE === '1';

/**
 * Build a direct public URL for an uploaded file.
 * Since the bucket policy allows anonymous s3:GetObject, no pre-signed URL
 * is needed — direct URLs work and won't expire.
 */
const buildPublicUrl = (key) => {
  // Trim trailing slash from endpoint for consistent URL construction.
  const base = endpoint.replace(/\/+$/, '');
  if (isPathStyle) return `${base}/${bucket}/${key}`;
  return `${base}/${key}`;
};

// ── MIME detection (lightweight, no extra dependencies) ──────────────────

const MIME_MAP = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.tiff': 'image/tiff',
  '.txt': 'text/plain',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
};

const getContentType = (filePath) => {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
};

// ── Main ─────────────────────────────────────────────────────────────────

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error('Usage: node scripts/codex-upload.mjs <file-path> [<file-path> ...]');
  console.error('');
  console.error('Uploads files to cloud storage and prints markdown URLs.');
  console.error('The S3 configuration is read from environment variables.');
  process.exit(1);
}

let uploadCount = 0;
const results = [];

for (const filePath of files) {
  try {
    const buffer = readFileSync(filePath);
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const ext = extname(filePath);
    const name = basename(filePath, ext);
    const key = `codex-images/${name}-${hash}${ext}`;
    const contentType = getContentType(filePath);

    await client.send(
      new PutObjectCommand({
        Body: buffer,
        Bucket: bucket,
        CacheControl: 'public, max-age=31536000',
        ContentType: contentType,
        Key: key,
      }),
    );

    const url = buildPublicUrl(key);

    if (contentType.startsWith('image/')) {
      results.push(`![${name}](${url})`);
    } else {
      results.push(`[${basename(filePath)}](${url})`);
    }

    uploadCount += 1;
  } catch (err) {
    console.error(`ERROR uploading "${filePath}": ${err.message}`);
  }
}

if (uploadCount > 0) {
  console.log(results.join('\n'));
  if (uploadCount < files.length) {
    console.error(`\n(${uploadCount}/${files.length} files uploaded successfully)`);
  }
} else {
  console.error('No files were uploaded.');
  process.exit(1);
}
