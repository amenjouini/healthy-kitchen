import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startTestServer, client, loggedIn, mealByEn, guestOrder } from './helpers.js';
import { deliverOutbox } from '../services/whatsapp.js';

const APP_SECRET = 'test-app-secret';
let ctx;
before(async () => {
  ctx = await startTestServer({
    whatsapp: { provider: 'meta', phoneNumberId: '123', accessToken: 'test-token', appSecret: APP_SECRET, verifyToken: 'verify-me' },
  });
});
after(async () => { await ctx.close(); });

const payload = (id, text, from = '21698765432') => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { contacts: [{ wa_id: from, profile: { name: 'Salma' } }], messages: [{ id, from, timestamp: '1760000000', type: 'text', text: { body: text } }] } }] }],
});

function signedPost(body) {
  const raw = JSON.stringify(body);
  const sig = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`;
  return client(ctx.base).raw('POST', '/api/webhooks/whatsapp', raw, { 'X-Hub-Signature-256': sig });
}

test('webhook verification handshake', async () => {
  const ok = await client(ctx.base).get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42');
  assert.equal(ok.status, 200);
  assert.equal(ok.body, 42);
  const bad = await client(ctx.base).get('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42');
  assert.equal(bad.status, 403);
});

test('signed messages are stored once (idempotent); unsigned/forged are rejected', async () => {
  const forged = await client(ctx.base).post('/api/webhooks/whatsapp', payload('wamid.1', 'hi'), { 'X-Hub-Signature-256': 'sha256=deadbeef' });
  assert.equal(forged.status, 401);
  const r1 = await signedPost(payload('wamid.1', '2 Bol Protéiné stp, Ariana'));
  assert.equal(r1.status, 200);
  assert.equal(r1.body.stored, 1);
  const r2 = await signedPost(payload('wamid.1', '2 Bol Protéiné stp, Ariana'));
  assert.equal(r2.body.stored, 0);
  const conv = ctx.db.get(`SELECT * FROM whatsapp_conversations WHERE wa_phone = '21698765432'`);
  assert.equal(conv.profile_name, 'Salma');
  assert.equal(conv.unread_count, 1);
});

test('staff convert a WhatsApp conversation into a normal order linked to the customer', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const conv = ctx.db.get(`SELECT * FROM whatsapp_conversations WHERE wa_phone = '21698765432'`);
  const inbox = await staff.get('/api/whatsapp/conversations');
  assert.equal(inbox.body.connected, true);
  assert.equal(inbox.body.items[0].lastMessage, '2 Bol Protéiné stp, Ariana');
  const meal = mealByEn(ctx.db, 'Protein Harvest');
  const r = await staff.post('/api/staff/orders', {
    ...guestOrder(meal.id), items: [{ mealId: meal.id, quantity: 2 }],
    customer: { name: 'Salma', phone: conv.wa_phone }, source: 'whatsapp', whatsappConversationId: conv.id, notes: 'Sans tahini',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const order = ctx.db.get('SELECT * FROM orders WHERE id = ?', r.body.order.id);
  assert.equal(order.source, 'whatsapp');
  assert.equal(order.whatsapp_conversation_id, conv.id);
  const linked = ctx.db.get('SELECT customer_id FROM whatsapp_conversations WHERE id = ?', conv.id);
  assert.equal(linked.customer_id, order.customer_id);
  // a new message from the same number is linked to the same customer automatically
  const detail = await staff.get(`/api/whatsapp/conversations/${conv.id}`);
  assert.equal(detail.body.conversation.customer.id, order.customer_id);
  assert.equal(detail.body.conversation.orders[0].number, order.number);
});

test('order updates are queued and sent through the provider; failures retried then marked failed', async () => {
  const sent = [];
  const provider = { sendText: async (to, body) => { sent.push({ to, body }); return { providerMessageId: `wamid.out.${sent.length}` }; } };
  await deliverOutbox(ctx.db, provider, { limit: 100 });
  assert.ok(sent.some((m) => m.to === '21698765432' && m.body.includes('reçue')));
  const failing = { sendText: async () => { throw new Error('boom'); } };
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  for (let i = 0; i < 3; i += 1) await deliverOutbox(ctx.db, failing, { limit: 100 });
  assert.ok(ctx.db.get(`SELECT COUNT(*) c FROM outbound_messages WHERE status = 'failed'`).c >= 1);
  // delivery status webhook updates the message
  const statusPayload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.out.1', status: 'read' }] } }] }] };
  await signedPost(statusPayload);
  assert.equal(ctx.db.get(`SELECT status FROM outbound_messages WHERE provider_message_id = 'wamid.out.1'`).status, 'read');
});

test('without a provider, messages are marked skipped — never reported as sent', async () => {
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  await deliverOutbox(ctx.db, null, { limit: 100 });
  assert.ok(ctx.db.get(`SELECT COUNT(*) c FROM outbound_messages WHERE status = 'skipped' AND error = 'whatsapp_not_configured'`).c >= 1);
});
