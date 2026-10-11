/**
 * English labels for enum values (translated with t()). `msg()` is an identity marker so
 * the message extractor (scripts/i18n-extract.js) finds these strings.
 */
export const msg = (s) => s;

export const STATUS_LABELS = {
  new: msg('New'), accepted: msg('Accepted'), preparing: msg('Preparing'), ready: msg('Ready'),
  completed: msg('Completed'), refused: msg('Refused'), cancelled: msg('Cancelled'),
};

export const STATUS_ACTIONS = {
  accepted: msg('Accept'), preparing: msg('Start preparing'), ready: msg('Mark ready'), completed: msg('Hand over / complete'),
  refused: msg('Refuse'), cancelled: msg('Cancel order'),
};

export const PAYMENT_STATUS_LABELS = {
  pending: msg('Unpaid'), paid: msg('Paid'), failed: msg('Payment failed'), refunded: msg('Refunded'),
  partially_refunded: msg('Partially refunded'), cancelled: msg('Payment cancelled'),
};

export const PAYMENT_METHOD_LABELS = { cash: msg('Cash'), online: msg('Online') };
export const SOURCE_LABELS = { web: msg('Website'), whatsapp: msg('WhatsApp'), phone: msg('Phone'), walk_in: msg('Walk-in') };
export const FULFILLMENT_LABELS = { delivery: msg('Delivery'), pickup: msg('Pickup') };

export const REFUSAL_LABELS = {
  insufficient_stock: msg('Insufficient stock'), meal_unavailable: msg('Meal unavailable'), delivery_problem: msg('Delivery problem'),
  outside_delivery_area: msg('Outside delivery area'), operational_issue: msg('Operational issue'), customer_request: msg('Customer request'),
  payment_issue: msg('Payment issue'), duplicate: msg('Duplicate order'), other: msg('Other'),
};

export const AVAILABILITY_LABELS = {
  available: msg('Available'), low_stock: msg('Low stock'), out_of_stock: msg('Out of stock'), unavailable: msg('Unavailable'),
};

export const MOVEMENT_LABELS = {
  opening: msg('Opening stock'), purchase: msg('Purchase'), adjustment: msg('Count adjustment'), waste: msg('Waste'),
  spoilage: msg('Spoiled'), damage: msg('Damaged'), consumption: msg('Used in production'), return: msg('Returned to supplier'),
};

export const EXPENSE_LABELS = {
  ingredients: msg('Ingredients'), packaging: msg('Packaging'), delivery: msg('Delivery'), salaries: msg('Salaries'), rent: msg('Rent'),
  marketing: msg('Marketing'), utilities: msg('Utilities'), equipment: msg('Equipment'), other: msg('Other'),
};

export const NUTRIENT_LABELS = {
  kcal: msg('Calories'), protein: msg('Protein'), carbs: msg('Carbohydrates'), fat: msg('Fat'), satFat: msg('of which saturated'),
  fiber: msg('Fiber'), sugar: msg('of which sugars'), sodium: msg('Sodium'),
};

export const SEGMENT_LABELS = { new: msg('New'), regular: msg('Regular'), frequent: msg('Frequent'), high_value: msg('High value'), lapsed: msg('Lapsed') };

export const PERMISSION_LABELS = {
  'orders.view': msg('View orders'), 'orders.manage': msg('Accept / refuse / progress orders'), 'orders.create': msg('Create orders (WhatsApp, phone)'),
  'orders.cancel': msg('Cancel accepted orders'), 'inventory.view': msg('View stock'), 'inventory.manage': msg('Record stock movements'),
  'meals.create': msg('Create meals'), 'meals.edit': msg('Edit meals, prices & availability'), 'ingredients.manage': msg('Manage ingredients'),
  'customers.view': msg('View customers'), 'payments.collect': msg('Confirm cash payments'), 'payments.manage': msg('Manage payments & refunds'),
  'finance.view': msg('View finances & margins'), 'expenses.manage': msg('Manage expenses'), 'staff.view': msg('View staff'),
  'staff.manage': msg('Manage staff accounts'), 'roles.manage': msg('Edit roles & permissions'), 'salaries.manage': msg('Manage salaries'),
  'analytics.view': msg('View analytics'), 'whatsapp.use': msg('Use WhatsApp inbox'), 'settings.manage': msg('Kitchen settings & delivery zones'),
  'audit.view': msg('View audit log'),
};

export const PERMISSION_GROUP_LABELS = {
  orders: msg('Orders'), kitchen: msg('Kitchen & menu'), customers: msg('Customers'), money: msg('Money'), team: msg('Team'), insight: msg('Insight & settings'),
};
