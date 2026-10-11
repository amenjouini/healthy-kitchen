/** Operational settings editable by admins (stored as JSON values). */
import { nowIso } from '../db/database.js';
import { audit } from './audit.js';

export const SETTING_DEFAULTS = {
  /** Block orders when ingredients are insufficient. Turn off only while opening stock is being entered. */
  'inventory.enforce': true,
  /** A meal is "low stock" when ≤ this many servings can still be made. */
  'inventory.lowStockServings': 5,
  /** Pause online ordering (e.g. kitchen closed). Staff can still create orders. */
  'kitchen.acceptingOrders': true,
  /** Cooks working in parallel — used to estimate the preparation backlog in minutes. */
  'kitchen.parallelCooks': 2,
};

export function getSettings(db) {
  const rows = db.all('SELECT key, value_json FROM settings');
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.key in SETTING_DEFAULTS) out[r.key] = JSON.parse(r.value_json);
  return out;
}

export function getSetting(db, key) {
  return getSettings(db)[key];
}

export function updateSettings(db, actor, patch) {
  return db.tx(() => {
    const before = getSettings(db);
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in SETTING_DEFAULTS)) continue;
      db.run(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        key, JSON.stringify(value), nowIso(),
      );
    }
    const after = getSettings(db);
    audit(db, actor, 'settings.update', 'settings', null, before, after);
    return after;
  });
}
