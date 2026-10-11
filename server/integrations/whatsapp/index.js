/**
 * Provider factory. Returns null when WhatsApp is not configured — callers must treat
 * that as "not connected" (messages are recorded as skipped, never reported as sent).
 *
 * Provider interface:
 *   name: string
 *   verifySignature(rawBody: Buffer, header: string|undefined): boolean
 *   verifyChallenge(query: object): string|null
 *   parseWebhook(payload): { messages: [...], statuses: [...] }
 *   sendText(toPhoneDigits: string, body: string): Promise<{ providerMessageId }>
 */
import { createMetaProvider } from './metaCloud.js';

export function createWhatsAppProvider(config) {
  const wa = config.whatsapp;
  if (wa.provider === 'meta') {
    const missing = ['phoneNumberId', 'accessToken', 'appSecret', 'verifyToken'].filter((k) => !wa[k]);
    if (missing.length) {
      console.warn(`[whatsapp] WHATSAPP_PROVIDER=meta but missing: ${missing.join(', ')} — integration disabled`);
      return null;
    }
    return createMetaProvider(wa);
  }
  if (wa.provider) console.warn(`[whatsapp] Unknown WHATSAPP_PROVIDER "${wa.provider}" — integration disabled`);
  return null;
}

export { parseMetaWebhook } from './metaCloud.js';
