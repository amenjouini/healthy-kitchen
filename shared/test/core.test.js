import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, formatMoney } from '../money.js';
import { canTransition, allowedTransitions, customerTimeline, isOrderLate } from '../orderStatus.js';
import { normalizePhone } from '../phone.js';
import { SYSTEM_ROLES, P } from '../permissions.js';

test('money parsing is exact to the millime', () => {
  assert.equal(parseMoney('18.5'), 18500);
  assert.equal(parseMoney(24), 24000);
  assert.equal(parseMoney('0.125'), 125);
  assert.equal(parseMoney('12,25'), 12250);
  assert.throws(() => parseMoney('-1'));
  assert.throws(() => parseMoney('1.2345'));
  assert.throws(() => parseMoney('abc'));
});

test('money formatting', () => {
  assert.equal(formatMoney(18500), '18.5 DT');
  assert.equal(formatMoney(18500, { fixed: true }), '18.500 DT');
  assert.equal(formatMoney(24000), '24 DT');
  assert.equal(formatMoney(-1500, { symbol: '' }), '−1.5');
});

test('order state machine allows only valid transitions', () => {
  assert.ok(canTransition('new', 'accepted'));
  assert.ok(canTransition('new', 'refused'));
  assert.ok(canTransition('accepted', 'preparing'));
  assert.ok(canTransition('preparing', 'ready'));
  assert.ok(canTransition('ready', 'completed'));
  assert.ok(!canTransition('new', 'preparing'));
  assert.ok(!canTransition('new', 'completed'));
  assert.ok(!canTransition('accepted', 'refused'));
  assert.ok(!canTransition('completed', 'cancelled'));
  assert.ok(!canTransition('refused', 'accepted'));
  assert.deepEqual(allowedTransitions('cancelled'), []);
});

test('customer timeline', () => {
  const states = (s) => customerTimeline(s).steps.map((x) => x.state[0]).join('');
  assert.equal(states('new'), 'duuuu');
  assert.equal(states('accepted'), 'dduuu');
  assert.equal(states('preparing'), 'ddcuu');
  assert.equal(states('ready'), 'ddddu');
  assert.equal(states('completed'), 'ddddd');
  assert.equal(customerTimeline('refused').outcome, 'refused');
});

test('late detection', () => {
  const now = new Date('2026-10-05T12:30:00Z');
  assert.ok(isOrderLate({ status: 'new', statusChangedAt: '2026-10-05T12:00:00Z' }, now));
  assert.ok(!isOrderLate({ status: 'new', statusChangedAt: '2026-10-05T12:28:00Z' }, now));
  assert.ok(!isOrderLate({ status: 'completed', statusChangedAt: '2026-10-05T10:00:00Z' }, now));
});

test('phone normalisation', () => {
  assert.equal(normalizePhone('98 123 456'), '21698123456');
  assert.equal(normalizePhone('+216 98 123 456'), '21698123456');
  assert.equal(normalizePhone('0021698123456'), '21698123456');
  assert.equal(normalizePhone('21698123456'), '21698123456');
  assert.equal(normalizePhone('123'), null);
});

test('default roles: staff cannot see finances or manage staff', () => {
  const staff = SYSTEM_ROLES.staff.permissions;
  assert.ok(!staff.includes(P.FINANCE_VIEW));
  assert.ok(!staff.includes(P.STAFF_MANAGE));
  assert.ok(!staff.includes(P.SALARIES_MANAGE));
  assert.ok(!SYSTEM_ROLES.admin.permissions.includes(P.ROLES_MANAGE));
  assert.equal(SYSTEM_ROLES.customer.permissions.length, 0);
});
