/**
 * Tiny router on top of node:http. Routes declare their access requirement
 * up-front so authorisation is enforced before any handler code runs:
 *
 *   r.get('/api/orders', { perm: P.ORDERS_VIEW }, (ctx) => …)
 *   r.post('/api/auth/login', { auth: 'public', rateLimit: 'login' }, (ctx) => …)
 *
 * access options: auth: 'public' | 'optional' | 'user' (default 'user'),
 *                 perm: string | string[] (all required), anyPerm: string[] (any one).
 */
import { HttpError, forbidden, unauthorized } from './errors.js';

function compile(pattern) {
  const keys = [];
  const regex = new RegExp(`^${pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
  return { regex, keys };
}

export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, options, handler) => {
    if (typeof options === 'function') { handler = options; options = {}; }
    routes.push({ method, pattern, ...compile(pattern), options, handler });
  };

  return {
    routes,
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    patch: add('PATCH'),
    delete: add('DELETE'),
    match(method, pathname) {
      let pathMatched = false;
      for (const route of routes) {
        const m = route.regex.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        const params = {};
        route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
}

/** Throws unless the context satisfies the route's access options. */
export function authorize(ctx, options) {
  const auth = options.auth ?? 'user';
  if (auth === 'public' || auth === 'optional') {
    if (!options.perm && !options.anyPerm) return;
  }
  if (!ctx.user) throw unauthorized();
  const required = options.perm ? [].concat(options.perm) : [];
  for (const p of required) if (!ctx.permissions.includes(p)) throw forbidden();
  if (options.anyPerm && !options.anyPerm.some((p) => ctx.permissions.includes(p))) throw forbidden();
}

/** Helper for handlers: require an extra permission decided at runtime. */
export function requirePerm(ctx, permission) {
  if (!ctx.user) throw unauthorized();
  if (!ctx.permissions.includes(permission)) throw forbidden();
}

export function can(ctx, permission) {
  return Boolean(ctx.user) && ctx.permissions.includes(permission);
}

export { HttpError };
