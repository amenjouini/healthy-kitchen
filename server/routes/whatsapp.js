/** WhatsApp webhook (provider → us) and staff inbox. */
import { v, validate } from '../http/validate.js';
import { HttpError } from '../http/errors.js';
import { P } from '../../shared/permissions.js';
import { parseMetaWebhook } from '../integrations/whatsapp/index.js';
import { ingestWebhookEvents, listConversations, getConversation, queueReply, setConversationStatus } from '../services/whatsapp.js';

export default function register(r, { db, config, whatsapp, kickOutbox }) {
  // Provider verification handshake.
  r.get('/api/webhooks/whatsapp', { auth: 'public', webhook: true, rateLimit: 'webhook' }, (ctx) => {
    const challenge = whatsapp?.verifyChallenge(ctx.query);
    if (!challenge) throw new HttpError(403, 'verification_failed', 'Webhook verification failed');
    ctx.rawResponse = { headers: { 'Content-Type': 'text/plain' }, body: String(challenge) };
  });

  // Incoming messages & delivery statuses. Signature is verified on the RAW body.
  r.post('/api/webhooks/whatsapp', { auth: 'public', webhook: true, rateLimit: 'webhook' }, (ctx) => {
    let events;
    if (whatsapp) {
      if (!whatsapp.verifySignature(ctx.rawBody, ctx.req.headers['x-hub-signature-256'])) {
        throw new HttpError(401, 'invalid_signature', 'Invalid webhook signature');
      }
      events = whatsapp.parseWebhook(ctx.body);
    } else if (config.whatsapp.allowUnsignedDev && !config.isProduction) {
      events = parseMetaWebhook(ctx.body); // local development only
    } else {
      throw new HttpError(503, 'whatsapp_not_configured', 'WhatsApp integration is not configured');
    }
    return ingestWebhookEvents(db, events);
  });

  r.get('/api/whatsapp/conversations', { perm: P.WHATSAPP_USE }, (ctx) => ({
    connected: Boolean(whatsapp),
    ...listConversations(db, validate({ search: v.string({ max: 100 }).optional(), status: v.oneOf(['open', 'closed']).optional() }, ctx.query)),
  }));

  r.get('/api/whatsapp/conversations/:id', { perm: P.WHATSAPP_USE }, (ctx) => ({
    connected: Boolean(whatsapp), conversation: getConversation(db, Number(ctx.params.id)),
  }));

  r.post('/api/whatsapp/conversations/:id/reply', { perm: P.WHATSAPP_USE }, (ctx) => {
    const { body } = validate({ body: v.text({ max: 4000 }) }, ctx.body);
    const result = queueReply(db, ctx.actor, Number(ctx.params.id), body, { providerConfigured: Boolean(whatsapp) });
    kickOutbox();
    return result;
  });

  r.post('/api/whatsapp/conversations/:id/status', { perm: P.WHATSAPP_USE }, (ctx) => {
    const { status } = validate({ status: v.oneOf(['open', 'closed']) }, ctx.body);
    setConversationStatus(db, Number(ctx.params.id), status);
    return { ok: true };
  });
}
