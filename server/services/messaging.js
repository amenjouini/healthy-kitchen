/**
 * Customer-facing order updates. Writes:
 *  • an in-app notification when the customer has an account, and
 *  • an outbound WhatsApp message into the outbox (delivered by the outbox worker
 *    when WhatsApp is configured, otherwise marked 'skipped' — never faked as sent).
 * Message texts are French (the shop's default customer language).
 */
import { nowIso } from '../db/database.js';
import { formatMoney } from '../../shared/money.js';
import { notify } from './notifications.js';

const TEMPLATES = {
  order_received: (o) => `Healthy Kitchen 🌿 Votre commande ${o.number} a bien été reçue (total ${formatMoney(o.total_millimes)}). Suivi : ${trackUrl(o)}`,
  order_accepted: (o) => `Bonne nouvelle ! Votre commande ${o.number} est acceptée. Nous la préparons très bientôt.`,
  order_preparing: (o) => `Votre commande ${o.number} est en préparation 👩‍🍳`,
  order_ready: (o) => (o.fulfillment === 'pickup'
    ? `Votre commande ${o.number} est prête ! Vous pouvez venir la récupérer.`
    : `Votre commande ${o.number} est prête et part en livraison 🛵`),
  order_completed: (o) => `Merci ! Votre commande ${o.number} est terminée. Bon appétit 🌿`,
  order_refused: (o) => `Désolé, nous ne pouvons pas honorer votre commande ${o.number}. Notre équipe vous contactera si besoin.`,
  order_cancelled: (o) => `Votre commande ${o.number} a été annulée.`,
  payment_confirmed: (o) => `Paiement de ${formatMoney(o.total_millimes)} reçu pour la commande ${o.number}. Merci !`,
};

const IN_APP_TITLES = {
  order_received: 'Order received', order_accepted: 'Order accepted', order_preparing: 'Your order is being prepared',
  order_ready: 'Your order is ready', order_completed: 'Order completed', order_refused: 'Order could not be accepted',
  order_cancelled: 'Order cancelled', payment_confirmed: 'Payment confirmed',
};

function trackUrl(o) {
  const origin = (process.env.PUBLIC_ORIGIN || '').replace(/\/$/, '');
  return `${origin}/track/${o.number}?t=${o.tracking_token}`;
}

/** @param {object} order raw orders row */
export function queueCustomerMessage(db, order, event) {
  const template = TEMPLATES[event];
  if (!template) throw new Error(`Unknown message event ${event}`);
  const customer = db.get('SELECT user_id FROM customers WHERE id = ?', order.customer_id);
  if (customer?.user_id) {
    notify(db, {
      userId: customer.user_id, type: `customer.${event}`, title: `${IN_APP_TITLES[event]} — ${order.number}`,
      link: `/track/${order.number}?t=${order.tracking_token}`, data: { orderId: order.id },
    });
  }
  if (order.customer_phone) {
    const ts = nowIso();
    db.run(
      `INSERT INTO outbound_messages (channel, to_phone, event, body, order_id, status, created_at, updated_at)
       VALUES ('whatsapp', ?, ?, ?, ?, 'queued', ?, ?)`,
      order.customer_phone, event, template(order), order.id, ts, ts,
    );
  }
}

export const STATUS_EVENTS = {
  accepted: 'order_accepted', preparing: 'order_preparing', ready: 'order_ready',
  completed: 'order_completed', refused: 'order_refused', cancelled: 'order_cancelled',
};
