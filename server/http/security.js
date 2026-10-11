/** Request hardening: security headers, CSRF origin check, in-memory rate limiting. */
import { HttpError } from './errors.js';

export function setSecurityHeaders(res, { isProduction }) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests:
 *  1. require a JSON body content type (cross-site HTML forms cannot send it without CORS), and
 *  2. if the browser sends an Origin header, it must match our host / configured origin.
 */
export function checkCsrf(req, { publicOrigin }) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Requests must be sent as application/json');
  }
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = new Set([`http://${req.headers.host}`, `https://${req.headers.host}`]);
  if (publicOrigin) allowed.add(publicOrigin.replace(/\/$/, ''));
  if (!allowed.has(origin)) throw new HttpError(403, 'bad_origin', 'Cross-site request blocked');
}

/** Fixed-window limiter, keyed per bucket + client key. Adequate for a single-process deployment. */
export function createRateLimiter(limits) {
  const hits = new Map();
  let lastSweep = Date.now();
  return function hit(bucket, key) {
    const rule = limits[bucket];
    if (!rule) return;
    const now = Date.now();
    if (now - lastSweep > 60_000) {
      for (const [k, entry] of hits) if (entry.resetAt < now) hits.delete(k);
      lastSweep = now;
    }
    const id = `${bucket}:${key}`;
    let entry = hits.get(id);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + rule.windowMs };
      hits.set(id, entry);
    }
    entry.count += 1;
    if (entry.count > rule.max) {
      throw new HttpError(429, 'rate_limited', 'Too many attempts — please wait a moment and try again', {
        retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
      });
    }
  };
}

export const DEFAULT_RATE_LIMITS = {
  login: { max: 10, windowMs: 15 * 60_000 },
  signup: { max: 10, windowMs: 60 * 60_000 },
  order: { max: 20, windowMs: 15 * 60_000 },
  track: { max: 120, windowMs: 15 * 60_000 },
  webhook: { max: 600, windowMs: 60_000 },
};
