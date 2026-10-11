/**
 * npm run db:seed            → base catalogue (safe for production, idempotent)
 * npm run db:seed -- --demo  → + demo staff, stock, zones and 60 days of synthetic orders (DEV ONLY)
 */
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/database.js';
import { seedCatalog, seedDemo } from '../db/seed.js';

const config = loadConfig();
const demo = process.argv.includes('--demo');
if (demo && config.isProduction) {
  console.error('Refusing to seed demo data with NODE_ENV=production');
  process.exit(1);
}
const db = openDatabase(config.dbPath);
const result = demo ? await seedDemo(db, { password: process.env.DEMO_PASSWORD || 'demo-password' }) : seedCatalog(db);
console.log(demo ? 'Demo data:' : 'Catalogue:', result);
db.close();
