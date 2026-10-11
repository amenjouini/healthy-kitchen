/**
 * Minimal declarative validation. Every request body/query passes through a schema
 * before reaching a service, so services can trust their input types.
 *
 *   const schema = { name: v.string({ max: 120 }), price: v.money(), notes: v.string().optional() };
 *   const data = validate(schema, body);   // throws 400 "validation_failed" with per-field errors
 */
import { badRequest } from './errors.js';
import { parseMoney } from '../../shared/money.js';
import { normalizePhone } from '../../shared/phone.js';

class Rule {
  constructor(check) {
    this.check = check;
    this.isOptional = false;
    this.defaultValue = undefined;
    this.allowNull = false;
  }
  optional() { this.isOptional = true; return this; }
  nullable() { this.allowNull = true; this.isOptional = true; return this; }
  default(value) { this.defaultValue = value; this.isOptional = true; return this; }
}

function fail(message) {
  const err = new Error(message);
  err.isValidation = true;
  throw err;
}

export const v = {
  string({ min = 0, max = 2000, trim = true, pattern } = {}) {
    return new Rule((value) => {
      if (typeof value !== 'string') fail('must be text');
      const s = trim ? value.trim() : value;
      if (s.length < Math.max(min, 1) && min > 0) fail(`must be at least ${min} characters`);
      if (s.length > max) fail(`must be at most ${max} characters`);
      if (pattern && !pattern.test(s)) fail('has an invalid format');
      return s;
    });
  },
  /** Non-empty string. */
  text(opts = {}) { return v.string({ min: 1, ...opts }); },
  email() {
    return new Rule((value) => {
      if (typeof value !== 'string') fail('must be text');
      const s = value.trim().toLowerCase();
      if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail('must be a valid email');
      return s;
    });
  },
  phone() {
    return new Rule((value) => {
      const p = normalizePhone(value);
      if (!p) fail('must be a valid phone number');
      return p;
    });
  },
  number({ min = -Infinity, max = Infinity, integer = false } = {}) {
    return new Rule((value) => {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) fail('must be a number');
      if (integer && !Number.isInteger(n)) fail('must be a whole number');
      if (n < min) fail(`must be ≥ ${min}`);
      if (n > max) fail(`must be ≤ ${max}`);
      return n;
    });
  },
  int(opts = {}) { return v.number({ ...opts, integer: true }); },
  id() { return v.int({ min: 1 }); },
  /** Accepts dinars ("18.5" / 18.5) and returns integer millimes. */
  money({ max = 100_000_000 } = {}) {
    return new Rule((value) => {
      let m;
      try { m = parseMoney(value); } catch { fail('must be a valid amount (max 3 decimals)'); }
      if (m > max) fail('is too large');
      return m;
    });
  },
  boolean() {
    return new Rule((value) => {
      if (value === true || value === 'true' || value === 1 || value === '1') return true;
      if (value === false || value === 'false' || value === 0 || value === '0') return false;
      return fail('must be true or false');
    });
  },
  oneOf(values) {
    return new Rule((value) => {
      if (!values.includes(value)) fail(`must be one of: ${values.join(', ')}`);
      return value;
    });
  },
  date() {
    return new Rule((value) => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) fail('must be a date (YYYY-MM-DD)');
      return value;
    });
  },
  datetime() {
    return new Rule((value) => {
      const t = typeof value === 'string' ? Date.parse(value) : NaN;
      if (Number.isNaN(t)) fail('must be a date-time');
      return new Date(t).toISOString();
    });
  },
  array(itemRule, { min = 0, max = 200 } = {}) {
    return new Rule((value, path) => {
      if (!Array.isArray(value)) fail('must be a list');
      if (value.length < min) fail(`must contain at least ${min} item(s)`);
      if (value.length > max) fail(`must contain at most ${max} items`);
      return value.map((item, i) => runRule(itemRule, item, `${path}[${i}]`));
    });
  },
  object(schema) {
    return new Rule((value, path) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('must be an object');
      return runSchema(schema, value, path);
    });
  },
};

const errorsKey = Symbol('errors');

function runRule(rule, value, path) {
  if (value === undefined || value === '' || value === null) {
    if ((value === null || value === '') && rule.allowNull) return null;
    if (rule.isOptional) return rule.defaultValue;
    throw Object.assign(new Error('is required'), { isValidation: true, path });
  }
  try {
    return rule.check(value, path);
  } catch (err) {
    if (err[errorsKey]) throw err;
    if (err.isValidation) throw Object.assign(err, { path: err.path ?? path });
    throw err;
  }
}

function runSchema(schema, input, prefix = '') {
  const out = {};
  const errors = {};
  for (const [key, rule] of Object.entries(schema)) {
    const path = prefix ? `${prefix}.${key}` : key;
    try {
      const value = runRule(rule, input?.[key], path);
      if (value !== undefined) out[key] = value;
    } catch (err) {
      if (err[errorsKey]) Object.assign(errors, err[errorsKey]);
      else if (err.isValidation) errors[err.path ?? path] = err.message;
      else throw err;
    }
  }
  if (Object.keys(errors).length) {
    const err = new Error('validation');
    err[errorsKey] = errors;
    throw err;
  }
  return out;
}

/** Validate `input` against `schema`, throwing HTTP 400 with `details.fields` on failure. */
export function validate(schema, input) {
  try {
    return runSchema(schema, input ?? {});
  } catch (err) {
    if (err[errorsKey]) throw badRequest('validation_failed', 'Some fields are invalid', { fields: err[errorsKey] });
    throw err;
  }
}
