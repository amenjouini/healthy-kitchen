/**
 * WhatsApp inside the Healthy Kitchen order system (provider-neutral).
 *  inbound webhook → conversation (per phone) → linked customer (matched by phone)
 *  staff read the conversation and create a normal order with source = 'whatsapp'
 *  order updates → outbox → provider (when configured)
 */
import { nowIso } from '../db/database.js';
import { conflict, notFound } from '../http/errors.js';
import { normalizePhone } from '../../shared/phone.js';
import { notify } from './notifications.js';
import { audit } from './audit.js';
import { P } from '../../shared/permissions.js';

function upsertConversation(db, phone, profileName, at) {
  let conv = db.get('SELECT * FROM whatsapp_conversations WHERE wa_phone = ?', phone);
  if (!conv) {
    const customer = db.get('SELECT id FROM customers WHERE phone = ?', phone);
    const id = db.run(
      'INSERT INTO whatsapp_conversations (wa_phone, customer_id, profile_name, last_message_at, created_at) VALUES (?, ?, ?, ?, ?)',
      phone, customer?.id ?? null, profileName, at, nowIso(),
    ).lastInsertRowid;
    conv = db.get('SELECT * FROM whatsapp_conversations WHERE id = ?', id);
  }
  return conv;
}

/** Store normalised webhook events. Idempotent: provider retries are ignored by message id. */
export function ingestWebhookEvents(db, { messages, statuses }) {
  return db.tx(() => {
    let stored = 0;
    for (const m of messages) {
      const phone = normalizePhone(m.from, '');
      if (!phone) continue;
      if (m.providerMessageId && db.get('SELECT 1 FROM whatsapp_messages WHERE wa_message_id = ?', m.providerMessageId)) continue;
      const conv = upsertConversation(db, phone, m.profileName, m.timestamp);
      db.run(
        `INSERT INTO whatsapp_messages (conversation_id, direction, wa_message_id, type, body, raw_json, created_at) VALUES (?, 'in', ?, ?, ?, ?, ?)`,
        conv.id, m.providerMessageId ?? null, m.type, m.body, JSON.stringify(m.raw ?? null), m.timestamp,
      );
      db.run(
        `UPDATE whatsapp_conversations SET unread_count = unread_count + 1, last_message_at = ?, status = 'open',
           profile_name = COALESCE(?, profile_name) WHERE id = ?`, m.timestamp, m.profileName, conv.id,
      );
      notify(db, {
        permission: P.WHATSAPP_USE, type: 'whatsapp.message', title: `WhatsApp: ${m.profileName ?? `+${phone}`}`,
        body: (m.body ?? '').slice(0, 140), link: `/staff/whatsapp/${conv.id}`, data: { conversationId: conv.id },
      });
      stored += 1;
    }
    for (const s of statuses) {
      if (!s.providerMessageId) continue;
      const mapped = ['sent', 'delivered', 'read', 'failed'].includes(s.status) ? s.status : null;
      if (!mapped) continue;
      db.run('UPDATE outbound_messages SET status = ?, error = COALESCE(?, error), updated_at = ? WHERE provider_message_id = ?', mapped, s.error, nowIso(), s.providerMessageId);
      db.run('UPDATE whatsapp_messages SET status = ? WHERE wa_message_id = ?', mapped, s.providerMessageId);
    }
    return { stored };
  });
}

export function listConversations(db, { search, status, page = 1, pageSize = 50 }) {
  const where = [];
  const params = [];
  if (status) { where.push('c.status = ?'); params.push(status); }
  if (search) { where.push('(c.wa_phone LIKE ? OR c.profile_name LIKE ? OR cu.name LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = db.all(
    `SELECT c.*, cu.name AS customer_name,
       (SELECT body FROM whatsapp_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_body,
       (SELECT COUNT(*) FROM orders WHERE whatsapp_conversation_id = c.id) AS order_count
     FROM whatsapp_conversations c LEFT JOIN customers cu ON cu.id = c.customer_id
     ${clause} ORDER BY c.last_message_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize,
  ).map((c) => ({
    id: c.id, phone: c.wa_phone, profileName: c.profile_name, customerId: c.customer_id, customerName: c.customer_name,
    lastMessageAt: c.last_message_at, lastMessage: c.last_body, unreadCount: c.unread_count, status: c.status, orderCount: c.order_count,
  }));
  return { items };
}

export function getConversation(db, id, { markRead = true } = {}) {
  const c = db.get('SELECT c.*, cu.name AS customer_name, cu.city, cu.address FROM whatsapp_conversations c LEFT JOIN customers cu ON cu.id = c.customer_id WHERE c.id = ?', id);
  if (!c) throw notFound('Conversation');
  if (markRead && c.unread_count) db.run('UPDATE whatsapp_conversations SET unread_count = 0 WHERE id = ?', id);
  const messages = db.all(
    `SELECT m.*, u.name AS sent_by_name FROM whatsapp_messages m LEFT JOIN users u ON u.id = m.sent_by WHERE m.conversation_id = ? ORDER BY m.id`, id,
  ).map((m) => ({ id: m.id, direction: m.direction, type: m.type, body: m.body, status: m.status, orderId: m.order_id, sentBy: m.sent_by_name, createdAt: m.created_at }));
  const orders = db.all('SELECT id, number, status, total_millimes, created_at FROM orders WHERE whatsapp_conversation_id = ? OR (customer_id = ? AND ? IS NOT NULL) ORDER BY id DESC LIMIT 20', id, c.customer_id, c.customer_id)
    .map((o) => ({ id: o.id, number: o.number, status: o.status, totalMillimes: o.total_millimes, createdAt: o.created_at }));
  return {
    id: c.id, phone: c.wa_phone, profileName: c.profile_name, status: c.status,
    customer: c.customer_id ? { id: c.customer_id, name: c.customer_name, city: c.city, address: c.address } : null,
    messages, orders,
  };
}

export function setConversationStatus(db, id, status) {
  const r = db.run('UPDATE whatsapp_conversations SET status = ? WHERE id = ?', status, id);
  if (!r.changes) throw notFound('Conversation');
}

/** Queue a staff reply. Fails clearly when the provider is not configured. */
export function queueReply(db, actor, conversationId, body, { providerConfigured }) {
  if (!providerConfigured) throw conflict('whatsapp_not_configured', 'WhatsApp is not connected — replies cannot be sent yet');
  return db.tx(() => {
    const c = db.get('SELECT * FROM whatsapp_conversations WHERE id = ?', conversationId);
    if (!c) throw notFound('Conversation');
    const ts = nowIso();
    const outId = db.run(
      `INSERT INTO outbound_messages (channel, to_phone, event, body, status, created_at, updated_at) VALUES ('whatsapp', ?, 'staff_reply', ?, 'queued', ?, ?)`,
      c.wa_phone, body, ts, ts,
    ).lastInsertRowid;
    db.run(
      `INSERT INTO whatsapp_messages (conversation_id, direction, type, body, status, sent_by, raw_json, created_at) VALUES (?, 'out', 'text', ?, 'queued', ?, ?, ?)`,
      c.id, body, actor?.userId ?? null, JSON.stringify({ outboundId: outId }), ts,
    );
    audit(db, actor, 'whatsapp.reply', 'whatsapp_conversation', c.id, undefined, { body });
    return { outboundId: outId };
  });
}

/**
 * Deliver queued outbound messages. Without a provider they are marked 'skipped'
 * (status visible to admins) — they are never reported as sent.
 */
export async function deliverOutbox(db, provider, { limit = 20 } = {}) {
  const queued = db.all(`SELECT * FROM outbound_messages WHERE status = 'queued' ORDER BY id LIMIT ?`, limit);
  for (const msg of queued) {
    if (!provider) {
      db.run(`UPDATE outbound_messages SET status = 'skipped', error = 'whatsapp_not_configured', updated_at = ? WHERE id = ?`, nowIso(), msg.id);
      continue;
    }
    try {
      const { providerMessageId } = await provider.sendText(msg.to_phone, msg.body);
      db.run(`UPDATE outbound_messages SET status = 'sent', provider_message_id = ?, attempts = attempts + 1, error = NULL, updated_at = ? WHERE id = ?`, providerMessageId, nowIso(), msg.id);
      const conv = upsertConversation(db, msg.to_phone, null, nowIso());
      const linked = db.get(`SELECT id FROM whatsapp_messages WHERE raw_json = ?`, JSON.stringify({ outboundId: msg.id }));
      if (linked) db.run(`UPDATE whatsapp_messages SET status = 'sent', wa_message_id = ? WHERE id = ?`, providerMessageId, linked.id);
      else {
        db.run(
          `INSERT INTO whatsapp_messages (conversation_id, direction, wa_message_id, type, body, status, order_id, created_at) VALUES (?, 'out', ?, 'text', ?, 'sent', ?, ?)`,
          conv.id, providerMessageId, msg.body, msg.order_id, nowIso(),
        );
      }
    } catch (err) {
      const attempts = msg.attempts + 1;
      db.run(
        'UPDATE outbound_messages SET status = ?, attempts = ?, error = ?, updated_at = ? WHERE id = ?',
        attempts >= 3 ? 'failed' : 'queued', attempts, String(err.message).slice(0, 300), nowIso(), msg.id,
      );
    }
  }
  return queued.length;
}

export function outboxStats(db) {
  return db.all('SELECT status, COUNT(*) AS n FROM outbound_messages GROUP BY status').reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {});
}
