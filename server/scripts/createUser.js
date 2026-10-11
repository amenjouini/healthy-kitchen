/**
 * Create or reset a back-office user.
 *   npm run user:create -- --email owner@example.com --name "Owner" --role super_admin --password "a long password"
 */
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/database.js';
import { seedSystemRoles, upsertUserWithRole } from '../services/users.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((a) => {
  const [k, ...rest] = a.trim().split(' ');
  return [k, rest.join(' ').replace(/^"|"$/g, '')];
}));
if (!args.email || !args.password) {
  console.error('Usage: npm run user:create -- --email <email> --password <password> [--name <name>] [--role super_admin|admin|manager|staff]');
  process.exit(1);
}
const db = openDatabase(loadConfig().dbPath);
seedSystemRoles(db);
const id = await upsertUserWithRole(db, { email: args.email.toLowerCase(), name: args.name || args.email, password: args.password, roleKey: args.role || 'super_admin' });
console.log(`User #${id} ${args.email} saved with role ${args.role || 'super_admin'}`);
db.close();
