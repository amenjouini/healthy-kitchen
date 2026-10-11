/**
 * WhatsApp Cloud API (Meta) adapter. ALL Meta-specific code lives here; the rest of the
 * app talks to the provider-neutral interface returned by createWhatsAppProvider().
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 *  • Outgoing:   POST https://graph.facebook.com/{version}/{phone-number-id}/messages (Bearer token)
 *  • Webhook:    GET verification (hub.mode/hub.verify_token/hub.challenge),
 *                POST events signed with X-Hub-Signature-256 = HMAC-SHA256(app secret, raw body)
 * Note: free-form text is only delivered inside the 24 h customer-service window; outside it,
 * Meta requires pre-approved templates (see README → WhatsApp).
 */
import crypto from 'node:crypto';

export function verifyMetaSignature(rawBody, header, appSecret) {
  if (!header || !appSecret || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex'));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Normalise a Meta webhook payload into provider-neutral events. */
export function parseMetaWebhook(payload) {
  const messages = [];
  const statuses = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages ?? []) {
        let body;
        if (m.type === 'text') body = m.text?.body ?? null;
        else if (m.type === 'button') body = m.button?.text ?? null;
        else if (m.type === 'interactive') body = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        else if (m.type === 'location') body = [m.location?.name, m.location?.address, m.location?.latitude && `${m.location.latitude},${m.location.longitude}`].filter(Boolean).join(' — ');
        else body = `[${m.type}]`;
        messages.push({
          providerMessageId: m.id, from: m.from, profileName: names.get(m.from) ?? null, type: m.type, body,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(), raw: m,
        });
      }
      for (const s of value.statuses ?? []) {
        statuses.push({ providerMessageId: s.id, status: s.status, error: s.errors?.[0]?.title ?? null });
      }
    }
  }
  return { messages, statuses };
}

export function createMetaProvider({ phoneNumberId, accessToken, appSecret, verifyToken, apiVersion }, fetchImpl = fetch) {
  return {
    name: 'meta',
    verifySignature: (rawBody, header) => verifyMetaSignature(rawBody, header, appSecret),
    verifyChallenge(query) {
      return query['hub.mode'] === 'subscribe' && verifyToken && query['hub.verify_token'] === verifyToken ? query['hub.challenge'] : null;
    },
    parseWebhook: parseMetaWebhook,
    async sendText(to, body) {
      const res = await fetchImpl(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: true } }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message ?? `WhatsApp API error ${res.status}`);
      return { providerMessageId: json?.messages?.[0]?.id ?? null };
    },
  };
}
