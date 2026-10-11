/**
 * Runtime configuration, read from environment variables only.
 * Start the server with `node --env-file-if-exists=.env` (see package.json) to load a local .env.
 * Secrets (WhatsApp tokens, admin password…) must never be committed — see .env.example.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function int(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be an integer`);
  return n;
}

export function loadConfig(overrides = {}) {
  const env = process.argv.includes('--production') ? 'production' : process.env.NODE_ENV || 'development';
  const config = {
    env,
    isProduction: env === 'production',
    rootDir: ROOT,
    port: int('PORT', 8787),
    // Production hosts (Render) must listen on all interfaces; local dev stays on loopback.
    host: process.env.HOST || (env === 'production' ? '0.0.0.0' : '127.0.0.1'),
    dbPath: process.env.DATABASE_PATH || path.join(ROOT, 'data', 'healthy-kitchen.db'),
    uploadsDir: process.env.UPLOADS_DIR || path.join(ROOT, 'data', 'uploads'),
    distDir: path.join(ROOT, 'dist'),
    /** Public origin used for CSRF origin checks and links in messages, e.g. https://healthykitchen.tn */
    publicOrigin: process.env.PUBLIC_ORIGIN || '',
    sessionDays: int('SESSION_DAYS', 14),
    /** Set to 1 behind a reverse proxy (nginx, Caddy…) so rate limits use the client IP from X-Forwarded-For. */
    // Render always sits behind its proxy (it sets RENDER=true), so trust it there automatically.
    trustProxy: process.env.TRUST_PROXY === '1' || process.env.RENDER === 'true',
    /** Seed the base catalogue on start when the database has no meals yet (idempotent). */
    seedOnStart: process.env.SEED_CATALOG_ON_START === '1',
    /** Business timezone offset in minutes (Tunisia = UTC+1, no DST). Used for "today" and hour-of-day analytics. */
    utcOffsetMinutes: int('BUSINESS_UTC_OFFSET_MINUTES', 60),
    whatsapp: {
      provider: process.env.WHATSAPP_PROVIDER || '', // 'meta' (WhatsApp Cloud API) or '' (disabled)
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      appSecret: process.env.WHATSAPP_APP_SECRET || '',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
      /** Only for local development: accept unsigned webhook calls. Never enable in production. */
      allowUnsignedDev: process.env.WHATSAPP_ALLOW_UNSIGNED_DEV === '1',
    },
    payments: {
      provider: process.env.PAYMENT_PROVIDER || '', // no online gateway connected yet
    },
    ...overrides,
  };
  if (config.isProduction && config.whatsapp.allowUnsignedDev) {
    throw new Error('WHATSAPP_ALLOW_UNSIGNED_DEV must not be enabled in production');
  }
  return config;
}
