/**
 * Builds the HTTP request handler. Kept separate from index.js so tests can run the
 * whole app against an in-memory database on a random port.
 */
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase } from './db/database.js';
import { createRouter, authorize } from './http/router.js';
import { HttpError } from './http/errors.js';
import { setSecurityHeaders, checkCsrf, createRateLimiter, DEFAULT_RATE_LIMITS } from './http/security.js';
import { loadSession, seedSystemRoles } from './services/users.js';
import { publicUploadPath } from './services/uploads.js';
import { deliverOutbox } from './services/whatsapp.js';
import { createWhatsAppProvider } from './integrations/whatsapp/index.js';
import registerAuth from './routes/auth.js';
import registerCatalog from './routes/catalog.js';
import registerOrders from './routes/orders.js';
import registerInventory from './routes/inventory.js';
import registerAdmin from './routes/admin.js';
import registerWhatsApp from './routes/whatsapp.js';

export const SESSION_COOKIE = 'hk_session';
const MAX_BODY = 8 * 1024 * 1024; // base64 uploads up to ~5 MB

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'payload_too_large', 'Request body is too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveFile(res, file, { immutable = false } = {}) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

export function createApp(config, { db: existingDb } = {}) {
  const db = existingDb ?? openDatabase(config.dbPath);
  seedSystemRoles(db);
  const whatsapp = createWhatsAppProvider(config);
  const rateLimit = createRateLimiter(config.rateLimits ?? DEFAULT_RATE_LIMITS);

  // Outbox delivery runs after the business transaction committed; failures never affect the request.
  let delivering = false;
  const kickOutbox = () => {
    if (delivering) return;
    delivering = true;
    setImmediate(async () => {
      try { await deliverOutbox(db, whatsapp); } catch (err) { console.error('[outbox]', err); } finally { delivering = false; }
    });
  };

  const router = createRouter();
  // Health check for the hosting platform: process up + database readable.
  router.get('/api/health', { auth: 'public' }, () => ({ status: 'ok', db: db.get('SELECT 1 AS ok').ok === 1, time: new Date().toISOString() }));
  const deps = { db, config, whatsapp, kickOutbox };
  for (const register of [registerAuth, registerCatalog, registerOrders, registerInventory, registerAdmin, registerWhatsApp]) register(router, deps);

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    setSecurityHeaders(res, config);

    // Public uploads (meal images)
    if (req.method === 'GET' && pathname.startsWith('/uploads/')) {
      const file = publicUploadPath(config.uploadsDir, pathname.slice('/uploads/'.length));
      if (file) return serveFile(res, file, { immutable: true });
      res.writeHead(404); return res.end();
    }

    if (!pathname.startsWith('/api/')) {
      // Production: serve the built SPA (index.html fallback for client routes).
      if (req.method !== 'GET' || !fs.existsSync(config.distDir)) { res.writeHead(404); return res.end('Not found'); }
      const candidate = path.normalize(path.join(config.distDir, pathname));
      if (candidate.startsWith(config.distDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return serveFile(res, candidate, { immutable: pathname.startsWith('/assets/') });
      }
      return serveFile(res, path.join(config.distDir, 'index.html'));
    }

    // The proxy APPENDS the real client IP; the left-most entries can be forged by the client.
    const forwarded = config.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',').map((x) => x.trim()).filter(Boolean).at(-1) ?? '' : '';
    const ip = forwarded || req.socket.remoteAddress || null;
    try {
      const match = router.match(req.method, pathname);
      if (!match) throw new HttpError(404, 'not_found', 'Endpoint not found');
      if (match.methodNotAllowed) throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
      const { route, params } = match;

      if (!route.options.webhook) checkCsrf(req, config);
      if (route.options.rateLimit) rateLimit(route.options.rateLimit, ip);

      const cookies = parseCookies(req.headers.cookie);
      const session = loadSession(db, cookies[SESSION_COOKIE]);
      const rawBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : Buffer.alloc(0);
      let body = {};
      if (rawBody.length && (req.headers['content-type'] ?? '').startsWith('application/json')) {
        try { body = JSON.parse(rawBody.toString('utf8')); } catch { throw new HttpError(400, 'invalid_json', 'Malformed JSON body'); }
      }

      const ctx = {
        req, res, db, config, params, body, rawBody, ip, cookies,
        query: Object.fromEntries(url.searchParams),
        user: session?.user ?? null,
        permissions: session?.permissions ?? [],
        roleKey: session?.roleKey ?? null,
        actor: { userId: session?.user?.id ?? null, ip },
        status: 200,
        headers: {},
        setCookie(name, value, { maxAge, httpOnly = true } = {}) {
          const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
          if (httpOnly) parts.push('HttpOnly');
          if (config.isProduction) parts.push('Secure');
          if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
          this.headers['Set-Cookie'] = [...(this.headers['Set-Cookie'] ?? []), parts.join('; ')];
        },
      };
      authorize(ctx, route.options);
      const result = await route.handler(ctx);
      if (res.headersSent) return undefined;
      for (const [k, val] of Object.entries(ctx.headers)) res.setHeader(k, val);
      if (ctx.rawResponse) {
        res.writeHead(ctx.status, ctx.rawResponse.headers);
        return res.end(ctx.rawResponse.body);
      }
      return sendJson(res, ctx.status, result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return sendJson(res, err.status, { error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) } });
      }
      console.error(`[api] ${req.method} ${pathname}`, err);
      return sendJson(res, 500, { error: { code: 'internal_error', message: 'Something went wrong' } });
    }
  }

  return { handle, db, router, whatsapp, kickOutbox };
}
