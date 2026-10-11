/**
 * Lists every UI string passed to t() / tt() / msg() in src/ and reports which ones are
 * missing from src/i18n/messages.js.
 *   node scripts/i18n-extract.js               → all keys with the files using them
 *   node scripts/i18n-extract.js --missing fr  → keys without a French translation
 *   node scripts/i18n-extract.js --missing ar  → customer-facing keys without Arabic
 */
import fs from 'node:fs';
import path from 'node:path';
import { MESSAGES } from '../src/i18n/messages.js';

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !p.includes(`i18n${path.sep}`)) files.push(p);
  }
})('src');

const unescape = (s) => s.replace(/\\(['"])/g, '$1');
const keys = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative('src', file).split(path.sep).join('/');
  const add = (raw) => {
    const key = unescape(raw);
    if (!keys.has(key)) keys.set(key, new Set());
    keys.get(key).add(rel);
  };
  // t('Text') / tt("Text") / msg('Text') — first argument literal
  for (const m of src.matchAll(/\b(?:t|tt|msg)\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) add(m[2]);
  // t(cond ? 'A' : 'B') — literals in conditional arguments (comparison operands are skipped)
  for (const call of src.matchAll(/\b(?:t|tt)\(([^()\n]*\?[^()\n]*)\)/g)) {
    for (const lit of call[1].matchAll(/(===?|!==?)?\s*(['"])((?:\\.|(?!\2).)*)\2/g)) {
      if (!lit[1] && lit[3]) add(lit[3]);
    }
  }
}

const lang = process.argv.includes('--missing') ? process.argv[process.argv.indexOf('--missing') + 1] : null;
// Arabic is only provided for customer-facing screens (dashboards are French/English).
const CUSTOMER = /^(pages\/(Menu|Checkout|Track|Account|Login)|components\/(menu|cart|auth|hero|domain|layout|ui)|App|utils)/;
const isCustomer = (k) => [...keys.get(k)].some((file) => CUSTOMER.test(file));
const list = [...keys.keys()].filter((k) => lang !== 'ar' || isCustomer(k)).sort();
if (lang) {
  const missing = list.filter((k) => !(k in (MESSAGES[lang] ?? {})));
  console.log(JSON.stringify(missing, null, 1));
  console.error(`${missing.length} of ${list.length} keys missing for "${lang}"`);
} else {
  console.log(JSON.stringify(Object.fromEntries([...keys].sort().map(([k, v]) => [k, [...v]])), null, 1));
}
