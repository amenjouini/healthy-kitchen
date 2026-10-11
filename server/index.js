/** Server entry point: `npm run server` (dev) or `npm start` (production, also serves dist/). */
import http from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { upsertUserWithRole } from './services/users.js';
import { notifyLateOrders } from './services/notifications.js';
import { isOrderLate } from '../shared/orderStatus.js';
import { seedCatalog } from './db/seed.js';
import fs from 'node:fs';

const config = loadConfig();
const app = createApp(config);

if (config.seedOnStart) {
  const r = seedCatalog(app.db);
  if (!r.skipped) console.log(`[bootstrap] Catalogue seeded (${r.meals} meals, ${r.ingredients} ingredients)`);
}
if (config.isProduction && !fs.existsSync(config.distDir)) console.warn('[server] dist/ not found — run "npm run build" before "npm start"');

// Optional bootstrap of the first super admin from the environment (see .env.example).
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const exists = app.db.get(`SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? AND r.key = 'super_admin'`, process.env.ADMIN_EMAIL);
  if (!exists) {
    await upsertUserWithRole(app.db, { email: process.env.ADMIN_EMAIL.toLowerCase(), name: process.env.ADMIN_NAME || 'Admin', password: process.env.ADMIN_PASSWORD, roleKey: 'super_admin' });
    console.log(`[bootstrap] Super admin ${process.env.ADMIN_EMAIL} created`);
  }
}

// Retry queued WhatsApp messages periodically — only when WhatsApp is configured (it is optional).
if (app.whatsapp) setInterval(app.kickOutbox, 60_000).unref();

// Alert staff about late / urgent orders (once per order and status).
setInterval(() => {
  try { notifyLateOrders(app.db, isOrderLate); } catch (err) { console.error('[late-orders]', err); }
}, 60_000).unref();

const server = http.createServer(app.handle);

// Graceful shutdown (deploys/restarts send SIGTERM): stop accepting requests, then close SQLite cleanly.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => { app.db.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}

server.listen(config.port, config.host, () => {
  console.log(`[server] Healthy Kitchen API on http://${config.host}:${config.port} (${config.env})`);
  if (app.whatsapp) console.log(`[server] WhatsApp: connected (${app.whatsapp.name})`);
});
