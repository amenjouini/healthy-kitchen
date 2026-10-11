/**
 * SQLite access layer (node:sqlite, synchronous).
 *
 * Concurrency model: the server is a single Node process and DatabaseSync is
 * synchronous, so a `tx()` callback runs start-to-finish without any other
 * request interleaving. Transactions use BEGIN IMMEDIATE so that, even if
 * several processes ever share the file, writers are serialised. This is what
 * makes "check stock → reserve stock" atomic (no overselling).
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** node:sqlite rejects booleans/undefined as parameters — normalise them. */
function normalizeParam(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function normalizeParams(params) {
  if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])
    && !(params[0] instanceof Uint8Array)) {
    const out = {};
    for (const [k, v] of Object.entries(params[0])) out[k] = normalizeParam(v);
    return [out];
  }
  return params.map(normalizeParam);
}

export class Db {
  constructor(filename) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.raw = new DatabaseSync(filename);
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.raw.exec('PRAGMA busy_timeout = 5000');
    if (filename !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL');
    this.statements = new Map();
    this.txDepth = 0;
  }

  prepare(sql) {
    let stmt = this.statements.get(sql);
    if (!stmt) {
      stmt = this.raw.prepare(sql);
      this.statements.set(sql, stmt);
    }
    return stmt;
  }

  /** @returns {{ changes: number, lastInsertRowid: number }} */
  run(sql, ...params) {
    return this.prepare(sql).run(...normalizeParams(params));
  }

  get(sql, ...params) {
    return this.prepare(sql).get(...normalizeParams(params));
  }

  all(sql, ...params) {
    return this.prepare(sql).all(...normalizeParams(params));
  }

  exec(sql) {
    this.raw.exec(sql);
  }

  /**
   * Run `fn` inside a transaction. Nested calls join the outer transaction.
   * `fn` MUST be synchronous — awaiting inside would break atomicity.
   */
  tx(fn) {
    if (this.txDepth > 0) return fn();
    this.raw.exec('BEGIN IMMEDIATE');
    this.txDepth += 1;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        throw new Error('db.tx() callback must be synchronous');
      }
      this.raw.exec('COMMIT');
      return result;
    } catch (err) {
      this.raw.exec('ROLLBACK');
      throw err;
    } finally {
      this.txDepth -= 1;
    }
  }

  close() {
    this.raw.close();
  }
}

/** Apply pending .sql migrations in filename order. Each runs in its own transaction. */
export function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  const applied = new Set(db.all('SELECT version FROM schema_migrations').map((r) => r.version));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.tx(() => {
      db.exec(sql);
      db.run('INSERT INTO schema_migrations (version) VALUES (?)', file);
    });
    ran.push(file);
  }
  return ran;
}

export function openDatabase(filename) {
  const db = new Db(filename);
  migrate(db);
  return db;
}

/** Current UTC timestamp in the ISO format used across all tables. */
export function nowIso() {
  return new Date().toISOString();
}
