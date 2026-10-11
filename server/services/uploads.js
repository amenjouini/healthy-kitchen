/**
 * File uploads (meal images = public, expense attachments = private).
 * Files arrive base64-encoded in JSON (keeps the API JSON-only for CSRF protection),
 * are type-checked by magic bytes, size-limited and stored outside the web root.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from '../db/database.js';
import { badRequest, notFound } from '../http/errors.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString() === '%PDF-', privateOnly: true },
};

export function saveUpload(db, actor, uploadsDir, { fileName, mime, dataBase64, visibility }) {
  const type = TYPES[mime];
  if (!type) throw badRequest('unsupported_file_type', 'Allowed: JPEG, PNG, WebP (and PDF for attachments)');
  if (type.privateOnly && visibility === 'public') throw badRequest('unsupported_file_type', 'PDF files can only be private attachments');
  const buffer = Buffer.from(dataBase64, 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) throw badRequest('file_too_large', 'Files must be under 5 MB');
  if (!type.magic(buffer)) throw badRequest('file_type_mismatch', 'File content does not match its type');
  const id = crypto.randomBytes(16).toString('hex');
  const dir = path.join(uploadsDir, visibility);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.${type.ext}`), buffer);
  db.run(
    'INSERT INTO uploads (id, file_name, mime, size, visibility, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, String(fileName).slice(0, 200), mime, buffer.length, visibility, actor?.userId ?? null, nowIso(),
  );
  return { id, url: visibility === 'public' ? `/uploads/${id}.${type.ext}` : `/api/uploads/${id}`, mime, size: buffer.length };
}

export function readPrivateUpload(db, uploadsDir, id) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw notFound('File');
  const row = db.get(`SELECT * FROM uploads WHERE id = ? AND visibility = 'private'`, id);
  if (!row) throw notFound('File');
  const file = path.join(uploadsDir, 'private', `${id}.${TYPES[row.mime].ext}`);
  return { row, buffer: fs.readFileSync(file) };
}

/** Resolve a public upload path safely (no traversal). */
export function publicUploadPath(uploadsDir, name) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return null;
  const file = path.join(uploadsDir, 'public', name);
  return fs.existsSync(file) ? file : null;
}
