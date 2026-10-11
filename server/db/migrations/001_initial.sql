-- Healthy Kitchen — initial schema.
-- Conventions: money in INTEGER millimes (1 DT = 1000), timestamps as ISO-8601 UTC text,
-- nutrition per 100 g, quantities in the ingredient's base unit (g | ml | pc).

-- ─── Access control ──────────────────────────────────────────────────────────
CREATE TABLE roles (
  id          INTEGER PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,   -- system roles cannot be deleted
  is_staff    INTEGER NOT NULL DEFAULT 1,   -- 0 for the customer role
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE role_permissions (
  role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,               -- sha256(token); the raw token only lives in the cookie
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ─── Staff & payroll ─────────────────────────────────────────────────────────
CREATE TABLE staff_profiles (
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  job_title       TEXT,
  hire_date       TEXT,
  salary_millimes INTEGER CHECK (salary_millimes IS NULL OR salary_millimes >= 0),
  salary_period   TEXT NOT NULL DEFAULT 'monthly' CHECK (salary_period IN ('monthly','weekly','daily','hourly')),
  notes           TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE salary_payments (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  period          TEXT NOT NULL,             -- e.g. '2026-10' or '2026-W41'
  amount_millimes INTEGER NOT NULL CHECK (amount_millimes >= 0),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  paid_at         TEXT,
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, period)
);

-- ─── Customers & delivery ────────────────────────────────────────────────────
CREATE TABLE delivery_zones (
  id                 INTEGER PRIMARY KEY,
  city               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  fee_millimes       INTEGER NOT NULL DEFAULT 0 CHECK (fee_millimes >= 0),
  min_order_millimes INTEGER NOT NULL DEFAULT 0 CHECK (min_order_millimes >= 0),
  is_active          INTEGER NOT NULL DEFAULT 1,
  sort_order         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE customers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT UNIQUE,                    -- normalised digits incl. country code (see shared/phone.js)
  email      TEXT COLLATE NOCASE,
  city       TEXT,
  address    TEXT,
  user_id    INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_customers_city ON customers(city);

-- ─── Catalogue ───────────────────────────────────────────────────────────────
CREATE TABLE categories (
  id         INTEGER PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  name_en    TEXT,
  name_ar    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE ingredients (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  name_en        TEXT,
  name_ar        TEXT,
  detail         TEXT,
  detail_en      TEXT,
  detail_ar      TEXT,
  base_unit      TEXT NOT NULL DEFAULT 'g' CHECK (base_unit IN ('g','ml','pc')),
  grams_per_unit REAL NOT NULL DEFAULT 1 CHECK (grams_per_unit > 0),
  -- nutrition per 100 g
  kcal       REAL NOT NULL DEFAULT 0 CHECK (kcal >= 0),
  protein_g  REAL NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g    REAL NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g      REAL NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  sat_fat_g  REAL NOT NULL DEFAULT 0 CHECK (sat_fat_g >= 0),
  fiber_g    REAL NOT NULL DEFAULT 0 CHECK (fiber_g >= 0),
  sugar_g    REAL NOT NULL DEFAULT 0 CHECK (sugar_g >= 0),
  sodium_mg  REAL NOT NULL DEFAULT 0 CHECK (sodium_mg >= 0),
  -- costing & stock
  cost_per_unit REAL CHECK (cost_per_unit IS NULL OR cost_per_unit >= 0), -- millimes per base unit
  track_stock   INTEGER NOT NULL DEFAULT 1,  -- 0 for things not worth counting (salt, water…)
  stock_qty     REAL NOT NULL DEFAULT 0,     -- on hand, base units; only changed via inventory_movements
  reorder_level REAL NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  -- "build your own bowl" (customer builder)
  is_customer_selectable INTEGER NOT NULL DEFAULT 0,
  portion_qty            REAL CHECK (portion_qty IS NULL OR portion_qty > 0),
  portion_price_millimes INTEGER CHECK (portion_price_millimes IS NULL OR portion_price_millimes >= 0),
  color          TEXT,
  archived_at    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE meals (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  name_en        TEXT,
  name_ar        TEXT,
  description    TEXT,
  description_en TEXT,
  description_ar TEXT,
  tag            TEXT,
  tag_en         TEXT,
  tag_ar         TEXT,
  category_id    INTEGER REFERENCES categories(id),
  image_url      TEXT,
  price_millimes INTEGER NOT NULL CHECK (price_millimes >= 0),
  servings       INTEGER NOT NULL DEFAULT 1 CHECK (servings >= 1),
  prep_minutes   INTEGER NOT NULL DEFAULT 10 CHECK (prep_minutes >= 0),
  is_available   INTEGER NOT NULL DEFAULT 1,  -- manual on/off switch, independent of stock
  is_featured    INTEGER NOT NULL DEFAULT 0,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  current_version_id INTEGER,                 -- → meal_versions.id
  archived_at    TEXT,
  created_by     INTEGER REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Current recipe. Quantities are for the whole recipe (divided by meals.servings per portion).
CREATE TABLE meal_ingredients (
  meal_id       INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  quantity      REAL NOT NULL CHECK (quantity > 0),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (meal_id, ingredient_id)
);
CREATE INDEX idx_meal_ingredients_ingredient ON meal_ingredients(ingredient_id);

-- Immutable snapshot of price + recipe + computed nutrition/cost. A new row is
-- written whenever any of these change, so history never shifts.
CREATE TABLE meal_versions (
  id               INTEGER PRIMARY KEY,
  meal_id          INTEGER NOT NULL REFERENCES meals(id),
  version          INTEGER NOT NULL,
  price_millimes   INTEGER NOT NULL,
  servings         INTEGER NOT NULL,
  recipe_json      TEXT NOT NULL,   -- [{ingredientId,name,quantity,baseUnit,grams,per100g,costPerUnit}]
  nutrition_json   TEXT NOT NULL,   -- per serving
  serving_weight_g REAL NOT NULL,
  cost_per_serving REAL NOT NULL,   -- millimes, estimate
  cost_complete    INTEGER NOT NULL,
  reason           TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (meal_id, version)
);

CREATE TABLE favorites (
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  meal_id     INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (customer_id, meal_id)
);

-- ─── Orders ──────────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id                INTEGER PRIMARY KEY,
  number            TEXT NOT NULL UNIQUE,
  tracking_token    TEXT NOT NULL,
  customer_id       INTEGER NOT NULL REFERENCES customers(id),
  source            TEXT NOT NULL CHECK (source IN ('web','whatsapp','phone','walk_in')),
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','accepted','preparing','ready','completed','refused','cancelled')),
  status_changed_at TEXT NOT NULL,
  fulfillment       TEXT NOT NULL CHECK (fulfillment IN ('delivery','pickup')),
  -- customer details as given for THIS order (snapshot)
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT,
  city              TEXT,
  address           TEXT,
  delivery_zone_id  INTEGER REFERENCES delivery_zones(id),
  notes             TEXT,
  requested_for     TEXT,
  -- money snapshot (server-computed)
  subtotal_millimes     INTEGER NOT NULL CHECK (subtotal_millimes >= 0),
  delivery_fee_millimes INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_millimes >= 0),
  discount_millimes     INTEGER NOT NULL DEFAULT 0 CHECK (discount_millimes >= 0),
  total_millimes        INTEGER NOT NULL CHECK (total_millimes >= 0),
  estimated_cost_millimes REAL NOT NULL DEFAULT 0,
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('cash','online')),
  payment_status    TEXT NOT NULL DEFAULT 'pending'
                    CHECK (payment_status IN ('pending','paid','failed','refunded','partially_refunded','cancelled')),
  refusal_reason    TEXT,
  cancellation_reason TEXT,
  status_note       TEXT,                    -- internal note from the last refusal/cancellation
  whatsapp_conversation_id INTEGER,
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  completed_at      TEXT
);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_city ON orders(city);

CREATE TABLE order_items (
  id                  INTEGER PRIMARY KEY,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL CHECK (kind IN ('meal','custom')),
  meal_id             INTEGER REFERENCES meals(id),
  meal_version_id     INTEGER REFERENCES meal_versions(id),
  name                TEXT NOT NULL,          -- snapshot
  quantity            INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price_millimes INTEGER NOT NULL CHECK (unit_price_millimes >= 0),
  line_total_millimes INTEGER NOT NULL CHECK (line_total_millimes >= 0),
  unit_cost_millimes  REAL NOT NULL DEFAULT 0, -- estimate at order time
  nutrition_json      TEXT NOT NULL,          -- per unit, snapshot
  components_json     TEXT NOT NULL,          -- ingredients per unit (kitchen view + history)
  notes               TEXT
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_meal ON order_items(meal_id);

CREATE TABLE order_status_history (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  reason      TEXT,
  note        TEXT,
  user_id     INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_order_history_order ON order_status_history(order_id);

-- ─── Inventory ───────────────────────────────────────────────────────────────
-- Stock held for orders that are not in production yet. available = stock_qty − Σ active.
CREATE TABLE inventory_reservations (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  quantity      REAL NOT NULL CHECK (quantity > 0),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','consumed','released')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_reservations_active ON inventory_reservations(ingredient_id, status);
CREATE INDEX idx_reservations_order ON inventory_reservations(order_id);

-- Append-only stock ledger. Every change to ingredients.stock_qty has a row here.
CREATE TABLE inventory_movements (
  id            INTEGER PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  type          TEXT NOT NULL CHECK (type IN ('opening','purchase','adjustment','waste','spoilage','damage','consumption','return')),
  quantity      REAL NOT NULL,               -- signed delta in base units
  stock_after   REAL NOT NULL,
  unit_cost     REAL,                        -- millimes per base unit (purchases)
  reason        TEXT,
  order_id      INTEGER REFERENCES orders(id),
  user_id       INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_movements_ingredient ON inventory_movements(ingredient_id, created_at);
CREATE INDEX idx_movements_type ON inventory_movements(type, created_at);

-- ─── Payments & finance ──────────────────────────────────────────────────────
CREATE TABLE payments (
  id                 INTEGER PRIMARY KEY,
  order_id           INTEGER NOT NULL REFERENCES orders(id),
  method             TEXT NOT NULL CHECK (method IN ('cash','online')),
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','failed','refunded','partially_refunded','cancelled')),
  amount_millimes    INTEGER NOT NULL CHECK (amount_millimes >= 0),
  refunded_millimes  INTEGER NOT NULL DEFAULT 0 CHECK (refunded_millimes >= 0),
  currency           TEXT NOT NULL DEFAULT 'TND',
  provider           TEXT,                   -- gateway name for online payments
  provider_reference TEXT,                   -- transaction id / transfer reference
  paid_at            TEXT,
  refunded_at        TEXT,
  refund_reason      TEXT,
  notes              TEXT,
  recorded_by        INTEGER REFERENCES users(id),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  CHECK (refunded_millimes <= amount_millimes)
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_paid_at ON payments(paid_at);

CREATE TABLE uploads (
  id          TEXT PRIMARY KEY,              -- random id, also the file name stem
  file_name   TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  visibility  TEXT NOT NULL CHECK (visibility IN ('public','private')),
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE expenses (
  id                    INTEGER PRIMARY KEY,
  category              TEXT NOT NULL CHECK (category IN ('ingredients','packaging','delivery','salaries','rent','marketing','utilities','equipment','other')),
  amount_millimes       INTEGER NOT NULL CHECK (amount_millimes >= 0),
  expense_date          TEXT NOT NULL,       -- YYYY-MM-DD
  description           TEXT NOT NULL,
  reference             TEXT,
  attachment_id         TEXT REFERENCES uploads(id),
  salary_payment_id     INTEGER UNIQUE REFERENCES salary_payments(id) ON DELETE CASCADE,
  inventory_movement_id INTEGER UNIQUE REFERENCES inventory_movements(id),
  created_by            INTEGER REFERENCES users(id),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX idx_expenses_date ON expenses(expense_date);

-- ─── Notifications & messaging ───────────────────────────────────────────────
-- Delivered to one user (user_id) or to every staff member holding `permission`.
CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  permission  TEXT,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  data_json   TEXT,
  dedupe_key  TEXT UNIQUE,                   -- prevents repeating the same alert (e.g. low stock)
  created_at  TEXT NOT NULL,
  CHECK (user_id IS NOT NULL OR permission IS NOT NULL)
);
CREATE INDEX idx_notifications_created ON notifications(created_at);

CREATE TABLE notification_reads (
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TEXT NOT NULL,
  PRIMARY KEY (notification_id, user_id)
);

-- Outbox for external messages (WhatsApp). Written in the same transaction as the
-- business change, delivered afterwards, so a provider outage never loses a message.
CREATE TABLE outbound_messages (
  id                  INTEGER PRIMARY KEY,
  channel             TEXT NOT NULL CHECK (channel IN ('whatsapp')),
  to_phone            TEXT NOT NULL,
  event               TEXT NOT NULL,
  body                TEXT NOT NULL,
  order_id            INTEGER REFERENCES orders(id),
  status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed','skipped')),
  error               TEXT,
  provider_message_id TEXT,
  attempts            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX idx_outbound_status ON outbound_messages(status);

CREATE TABLE whatsapp_conversations (
  id              INTEGER PRIMARY KEY,
  wa_phone        TEXT NOT NULL UNIQUE,
  customer_id     INTEGER REFERENCES customers(id),
  profile_name    TEXT,
  last_message_at TEXT,
  unread_count    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at      TEXT NOT NULL
);

CREATE TABLE whatsapp_messages (
  id              INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES whatsapp_conversations(id),
  direction       TEXT NOT NULL CHECK (direction IN ('in','out')),
  wa_message_id   TEXT UNIQUE,               -- idempotency for webhook retries
  type            TEXT NOT NULL DEFAULT 'text',
  body            TEXT,
  status          TEXT,
  order_id        INTEGER REFERENCES orders(id),
  sent_by         INTEGER REFERENCES users(id),
  raw_json        TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_wa_messages_conv ON whatsapp_messages(conversation_id, created_at);

-- ─── Audit & settings ────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  old_json    TEXT,
  new_json    TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
