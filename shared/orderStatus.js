/**
 * Order lifecycle state machine — shared by server (enforcement) and client
 * (which buttons to show). The server is the only place transitions happen.
 *
 *   new ──► accepted ──► preparing ──► ready ──► completed
 *    │          │            │           │
 *    ├► refused  └──────────►├► cancelled ◄┘
 *    └► cancelled
 */

export const ORDER_STATUS = Object.freeze({
  NEW: 'new',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  REFUSED: 'refused',
  CANCELLED: 'cancelled',
});

export const ORDER_STATUSES = Object.values(ORDER_STATUS);

const TRANSITIONS = {
  new: ['accepted', 'refused', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  refused: [],
  cancelled: [],
};

export const TERMINAL_STATUSES = ['completed', 'refused', 'cancelled'];
export const ACTIVE_STATUSES = ['new', 'accepted', 'preparing', 'ready'];

/** Statuses before production started — stock is still only reserved, not consumed. */
export const PRE_PRODUCTION_STATUSES = ['new', 'accepted'];

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function allowedTransitions(from) {
  return [...(TRANSITIONS[from] ?? [])];
}

export function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

export const REFUSAL_REASONS = [
  'insufficient_stock',
  'meal_unavailable',
  'delivery_problem',
  'outside_delivery_area',
  'operational_issue',
  'customer_request',
  'other',
];

export const CANCELLATION_REASONS = ['customer_request', 'payment_issue', 'delivery_problem', 'operational_issue', 'duplicate', 'other'];

export const ORDER_SOURCES = ['web', 'whatsapp', 'phone', 'walk_in'];
export const FULFILLMENT_TYPES = ['delivery', 'pickup'];
export const PAYMENT_METHODS = ['cash', 'online'];
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled'];

/**
 * Minutes an order may stay in a status before it is flagged late.
 * Kept deliberately simple; tune to the kitchen's real service times.
 */
export const LATE_AFTER_MINUTES = { new: 5, accepted: 15, preparing: 25, ready: 30 };

/**
 * @param {{ status: string, statusChangedAt: string, requestedFor?: string|null }} order
 * @param {Date} [now]
 */
export function isOrderLate(order, now = new Date()) {
  if (!ACTIVE_STATUSES.includes(order.status)) return false;
  if (order.requestedFor && order.status !== 'ready' && new Date(order.requestedFor) < now) return true;
  const limit = LATE_AFTER_MINUTES[order.status];
  const since = new Date(order.statusChangedAt).getTime();
  return Number.isFinite(since) && now.getTime() - since > limit * 60_000;
}

/**
 * Customer-facing tracking steps. Hides internal states and staff details.
 * @returns {{ steps: Array<{ key: string, state: 'done'|'current'|'upcoming' }>, outcome: null|'refused'|'cancelled' }}
 */
export function customerTimeline(status) {
  const keys = ['received', 'accepted', 'preparing', 'ready', 'completed'];
  const position = { new: 0, accepted: 1, preparing: 2, ready: 3, completed: 4 };
  if (status === 'refused' || status === 'cancelled') {
    return { steps: keys.map((key, i) => ({ key, state: i === 0 ? 'done' : 'upcoming' })), outcome: status };
  }
  const current = position[status] ?? 0;
  return {
    steps: keys.map((key, i) => ({
      key,
      // Every step is a milestone (done once reached) except "preparing", which is an
      // ongoing activity and is shown as in-progress while the kitchen is cooking.
      state: i < current ? 'done' : i === current ? (key === 'preparing' ? 'current' : 'done') : 'upcoming',
    })),
    outcome: null,
  };
}
