/** Server entry point: `npm run server` (dev) or `npm start` (production, also serves dist/). */
import http from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { upsertUserWithRole } from './services/users.js';
import { notifyLateOrders } from './services/notifications.js';
import { isOrderLate } from '../shared/orderStatus.js';
import { seedCatalog, seedDemo } from './db/seed.js';
import fs from 'node:fs';

const config = loadConfig();
const app = createApp(config);

if (config.seedOnStart) {
  const r = seedCatalog(app.db);
  if (!r.skipped) console.log(`[bootstrap] Catalogue seeded (${r.meals} meals, ${r.ingredients} ingredients)`);
}

// DEMO ONLY: fill an EMPTY database with the demo accounts, stock and ~60 days of synthetic orders
// (same generator as `npm run db:seed:demo`). Never touches a database that already has orders.
// Meant for throw-away demo instances (e.g. Render free plan, where the disk is reset on restart).
if (process.env.SEED_DEMO_ON_START === '1') {
  const orders = app.db.get('SELECT COUNT(*) AS n FROM orders').n;
  if (orders === 0) {
    const r = await seedDemo(app.db, { password: process.env.DEMO_PASSWORD || 'demo-password' });
    if (!r.skipped) console.log(`[bootstrap] DEMO data seeded: ${r.orders} orders, accounts ${r.accounts.join(', ')}`);
  } else {
    console.log(`[bootstrap] SEED_DEMO_ON_START ignored: database already has ${orders} orders`);
  }
}
if (config.isProduction && !fs.existsSync(config.distDir)) console.warn('[server] dist/ not found — run "npm run build" before "npm start"');

// Optional bootstrap of the first super admin from the environment (see .env.example).
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const exists = app.db.get(`SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ? AND r.key = 'super_admin'`, process.env.ADMIN_EMAIL);
  if (!exists) {
    try {
      await upsertUserWithRole(app.db, { email: process.env.ADMIN_EMAIL.toLowerCase(), name: process.env.ADMIN_NAME || 'Admin', password: process.env.ADMIN_PASSWORD, roleKey: 'super_admin' });
      console.log(`[bootstrap] Super admin ${process.env.ADMIN_EMAIL} created`);
    } catch (err) {
      console.error(`[bootstrap] Could not create the admin account: ${err.message}`);
    }
  }
}

// Startup diagnostics (no secrets): which database file is used and whether anyone can log in.
const userCount = app.db.get('SELECT COUNT(*) AS n FROM users').n;
const staffCount = app.db.get('SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.is_staff = 1 AND u.is_active = 1').n;
console.log(`[db] ${config.dbPath} · ${userCount} account(s), ${staffCount} active staff/admin`);
if (config.isProduction && staffCount === 0) {
  console.warn('[db] No admin account exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ chars) and restart to create one.');
}
if (process.env.RENDER === 'true' && !config.dbPath.startsWith('/var/data')) {
  console.warn('[db] Database is on the ephemeral Render filesystem: it is reset on every deploy, restart and free-plan spin-down.');
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
