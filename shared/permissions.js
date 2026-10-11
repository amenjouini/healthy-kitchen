/**
 * Permission catalogue + default role definitions.
 * Enforcement happens on the server (requirePermission); the client only uses
 * these to decide what to show.
 */

export const P = Object.freeze({
  ORDERS_VIEW: 'orders.view',
  ORDERS_MANAGE: 'orders.manage', // accept / refuse / progress status
  ORDERS_CREATE: 'orders.create', // create orders on behalf of customers (WhatsApp, phone, walk-in)
  ORDERS_CANCEL: 'orders.cancel', // cancel an order after it was accepted
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage', // record purchases, waste, adjustments
  MEALS_CREATE: 'meals.create',
  MEALS_EDIT: 'meals.edit', // edit recipes, prices, availability, archive
  INGREDIENTS_MANAGE: 'ingredients.manage',
  CUSTOMERS_VIEW: 'customers.view',
  PAYMENTS_COLLECT: 'payments.collect', // mark cash collected at hand-over
  PAYMENTS_MANAGE: 'payments.manage', // verify online payments, refunds, references
  FINANCE_VIEW: 'finance.view', // revenue, expenses, margins, payment list
  EXPENSES_MANAGE: 'expenses.manage',
  STAFF_VIEW: 'staff.view',
  STAFF_MANAGE: 'staff.manage',
  ROLES_MANAGE: 'roles.manage',
  SALARIES_MANAGE: 'salaries.manage',
  ANALYTICS_VIEW: 'analytics.view',
  WHATSAPP_USE: 'whatsapp.use', // inbox, replies, convert to order
  SETTINGS_MANAGE: 'settings.manage', // delivery zones, categories, kitchen settings
  AUDIT_VIEW: 'audit.view',
});

export const ALL_PERMISSIONS = Object.values(P);

/** Grouping used by the role editor UI. */
export const PERMISSION_GROUPS = [
  { key: 'orders', permissions: [P.ORDERS_VIEW, P.ORDERS_MANAGE, P.ORDERS_CREATE, P.ORDERS_CANCEL] },
  { key: 'kitchen', permissions: [P.INVENTORY_VIEW, P.INVENTORY_MANAGE, P.MEALS_CREATE, P.MEALS_EDIT, P.INGREDIENTS_MANAGE] },
  { key: 'customers', permissions: [P.CUSTOMERS_VIEW, P.WHATSAPP_USE] },
  { key: 'money', permissions: [P.PAYMENTS_COLLECT, P.PAYMENTS_MANAGE, P.FINANCE_VIEW, P.EXPENSES_MANAGE, P.SALARIES_MANAGE] },
  { key: 'team', permissions: [P.STAFF_VIEW, P.STAFF_MANAGE, P.ROLES_MANAGE] },
  { key: 'insight', permissions: [P.ANALYTICS_VIEW, P.AUDIT_VIEW, P.SETTINGS_MANAGE] },
];

export const SYSTEM_ROLES = {
  super_admin: {
    name: 'Super Admin',
    description: 'Full access, including roles and other admins. Cannot be modified.',
    permissions: ALL_PERMISSIONS,
    isStaff: true,
  },
  admin: {
    name: 'Admin',
    description: 'Runs the business: everything except editing role definitions.',
    permissions: ALL_PERMISSIONS.filter((p) => p !== P.ROLES_MANAGE),
    isStaff: true,
  },
  manager: {
    name: 'Manager',
    description: 'Runs the kitchen floor: orders, menu, inventory, customers, analytics.',
    permissions: [
      P.ORDERS_VIEW, P.ORDERS_MANAGE, P.ORDERS_CREATE, P.ORDERS_CANCEL,
      P.INVENTORY_VIEW, P.INVENTORY_MANAGE, P.MEALS_CREATE, P.MEALS_EDIT, P.INGREDIENTS_MANAGE,
      P.CUSTOMERS_VIEW, P.PAYMENTS_COLLECT, P.WHATSAPP_USE, P.ANALYTICS_VIEW, P.STAFF_VIEW,
    ],
    isStaff: true,
  },
  staff: {
    name: 'Staff',
    description: 'Kitchen team: handles orders, stock movements and WhatsApp orders.',
    permissions: [P.ORDERS_VIEW, P.ORDERS_MANAGE, P.ORDERS_CREATE, P.INVENTORY_VIEW, P.INVENTORY_MANAGE, P.PAYMENTS_COLLECT, P.WHATSAPP_USE],
    isStaff: true,
  },
  customer: {
    name: 'Customer',
    description: 'Online customer account.',
    permissions: [],
    isStaff: false,
  },
};

/** Permissions that grant access to the admin area (any one is enough). */
export const ADMIN_AREA_PERMISSIONS = [
  P.FINANCE_VIEW, P.ANALYTICS_VIEW, P.STAFF_VIEW, P.MEALS_EDIT, P.MEALS_CREATE, P.INGREDIENTS_MANAGE,
  P.CUSTOMERS_VIEW, P.SETTINGS_MANAGE, P.AUDIT_VIEW, P.PAYMENTS_MANAGE,
];

export function hasPermission(permissions, permission) {
  return Array.isArray(permissions) && permissions.includes(permission);
}

export function hasAnyPermission(permissions, list) {
  return list.some((p) => hasPermission(permissions, p));
}
