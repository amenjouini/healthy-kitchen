# Healthy Kitchen

Food ordering + kitchen management platform: customer website (FR / EN / AR), kitchen
dashboard for staff, and an admin back-office (menu, ingredients, stock, orders, payments,
customers, team, finance, analytics, WhatsApp).

- **Frontend:** React 19 + Vite + Tailwind 4 + Framer Motion + React Router 7 + Recharts
- **Backend:** Node.js ≥ 22.13 using only built-ins — `node:http`, `node:sqlite`, `node:crypto`, `node:test`.
  No server dependencies to install or patch.
- **Database:** one SQLite file (`data/healthy-kitchen.db`), WAL mode, migrations in `server/db/migrations`.

## Quick start (development)

```bash
npm install
cp .env.example .env            # optional; every value has a development default
npm run db:seed                 # base catalogue (the dishes & ingredients from the website)
npm run db:seed:demo            # OPTIONAL dev data: staff accounts, stock, zones, ~300 past orders
npm run dev:all                 # API on :8787 + Vite on :5173 (proxying /api and /uploads)
```

Demo accounts (only after `db:seed:demo`, password `demo-password`):
`admin@demo.local` (super admin), `manager@demo.local`, `staff@demo.local`, `customer@demo.local`.

Create a real first admin instead with
`npm run user:create -- --email you@example.com --password "a long password" --name "Your Name"`
or set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` (created on first start).

| Script | What it does |
|---|---|
| `npm run dev` / `npm run server` / `npm run dev:all` | Vite only / API only (auto-restart) / both |
| `npm test` | 62 tests: nutrition maths, state machine, orders, inventory & concurrency, permissions, payments, finance, WhatsApp |
| `npm run lint` | ESLint (frontend + server) |
| `npm run i18n:check` | Lists UI strings missing a French or Arabic translation |
| `npm run build` then `npm start` | Production: one Node process serves the built site **and** the API |

## Areas

| URL | Who | What |
|---|---|---|
| `/`, `/menu`, `/checkout`, `/track/:number`, `/account` | customers | menu with full nutrition, build-your-own bowl, calorie planner, cart, checkout, live tracking, reorder, favourites |
| `/staff` | any role with `orders.view` | today's board (new → accepted → preparing → ready), order tickets, new WhatsApp/phone orders, stock, WhatsApp inbox |
| `/admin` | roles with an admin permission | overview, orders, meal builder, ingredients, stock, customers, team & roles, finance, analytics, WhatsApp, settings, audit log |

Navigation only *hides* what you cannot use — **every permission is enforced by the API** (see `server/test/security.test.js`).

## How the business rules work

### Nutrition — one calculator
`shared/nutrition.js` is the **only** nutrition/cost maths in the codebase. The server uses it to
compute and store values; the builders use the same file for the live preview.

- Ingredients store nutrition **per 100 g** (kcal, protein, carbs, fat, saturated fat, fiber, sugars, sodium).
- Quantities are in the ingredient's base unit — `g`, `ml` (with density) or `pc` (with weight per piece) — and converted to grams.
- Meal per serving = Σ(ingredient per-100 g × grams / 100) ÷ servings. Example: 150 g chicken (165 kcal/100 g) → 247.5 kcal, 46.5 g protein.
- Nutrition, prices and totals sent by a browser are ignored; the server recalculates everything.
- The old site computed macros as fixed % of calories and showed hand-typed numbers that didn't add up; those are gone.

### History never changes
Every change to a meal's price, servings or recipe — or to an ingredient used by it — writes a new immutable
**meal version** (`meal_versions`). Order lines store their own snapshot (name, unit price, nutrition, cost,
ingredient quantities). Editing chicken from 165 to 170 kcal tomorrow does not alter yesterday's orders.

### Stock, reservations and overselling
- Stock changes **only** through the movement ledger (`inventory_movements`: purchase, waste, spoilage, damage, count adjustment, consumption…), each with user, reason and time.
- Placing an order checks and **reserves** ingredients in one synchronous SQLite transaction, so two customers ordering the last portion at the same moment cannot both succeed (tested with 5 parallel orders).
- Refused/cancelled before cooking → reservation released. **Start preparing** → reservation becomes a consumption movement. Cancelled after cooking → nothing returns to stock (record waste if discarded).
- Meal availability is derived: `available` / `low_stock` / `out_of_stock` (from ingredients) / `unavailable` (switched off manually).
- *Settings → Block orders when stock is insufficient* can be switched off temporarily while opening stock is entered.

### Order state machine (`shared/orderStatus.js`)
`new → accepted → preparing → ready → completed`, plus `refused` (from new, reason required) and
`cancelled` (customer while new; staff with `orders.cancel` later). Invalid transitions are rejected by the API.
Every change is recorded in `order_status_history` and the audit log; customers are notified.

### Payments
Each order has a payment record (method, status, amount, reference, refunds) — not a boolean.
Staff with `payments.collect` confirm **cash** at hand-over; `payments.manage` records online/transfer payments (reference required),
failures and refunds. A paid order that gets cancelled raises a refund alert to payment managers.
**No online gateway is integrated yet** (see below) — customers currently pay cash.

### Roles & permissions (`shared/permissions.js`)
System roles: Super Admin, Admin, Manager, Staff, Customer; custom roles can be created.
Nobody can grant a permission they don't hold, change their own role, or touch a super admin unless they are one.
Staff never receive cost, margin, payment-reference or finance data from the API.

### Finance (management figures, not statutory accounting)
Revenue = payments received − refunds (by payment date). Expenses by category; paid salaries post an expense
automatically; an ingredient purchase can optionally be booked as an expense. Meal cost and margin are **estimates**
from ingredient costs (no labour, packaging, energy or waste). No VAT/tax handling.

### Analytics & insights
Descriptive statistics only (best/worst sellers, revenue & margin by meal, cancellation and reorder rates, ingredient
usage/cost/waste, cities, day/hour/weekday/month). "Insights" are explicit rules with minimum-data thresholds that show the
numbers they're based on — they are not AI. "Days left" for stock = available ÷ 14-day average use.
No predictive models are implemented; the order, stock and customer history is collected for them.

## WhatsApp (Meta WhatsApp Cloud API)

All provider code is in `server/integrations/whatsapp/`; the rest of the app is provider-neutral.
Without configuration WhatsApp is **off**: staff can still enter WhatsApp orders manually, and order updates are
stored in the outbox as `skipped` (never shown as sent).

1. Create a Meta app with the WhatsApp product and a business phone number.
2. Set in `.env`: `WHATSAPP_PROVIDER=meta`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (permanent system-user token),
   `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (any random string), and `PUBLIC_ORIGIN` (used in tracking links).
3. In Meta's webhook settings use `https://<your-domain>/api/webhooks/whatsapp` with the same verify token and subscribe to `messages`.

Then: incoming messages appear in the inbox, matched to customers by phone number; staff click **Create order** to turn a
conversation into a normal order (`source = whatsapp`); order received/accepted/preparing/ready/completed/payment messages are sent
automatically (retried up to 3 times). Webhook calls must carry a valid `X-Hub-Signature-256`.
Note: Meta only delivers free-form messages within 24 h of the customer's last message; outside that window it requires
pre-approved templates — add them in `metaCloud.js` (`sendText` is the single place to change).

## Online payments

`PAYMENT_PROVIDER` is reserved for a future gateway (e.g. Konnect, Flouci, Paymee). Until one is integrated, the online option is
shown as "coming soon" to customers and the API refuses customer online payments; admins can still record online/bank/D17
payments manually with a reference.

## Deploying on Render

`render.yaml` defines one web service (site + API on the same origin, so no CORS) with a 1 GB persistent disk at
`/var/data` holding the SQLite database and uploads. Health check: `GET /api/health`. On first start the base
catalogue is seeded (`SEED_CATALOG_ON_START=1`) and the first super admin is created from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`. A persistent disk requires a paid instance (Starter). PostgreSQL is not used: the backend is built on
synchronous SQLite transactions (which is what prevents overselling); moving to Postgres would mean rewriting the data layer.

## Production (any server)

```bash
npm ci && npm run build
npm run db:seed                 # first time only
npm start                       # serves dist/ + /api on PORT (default 8787)
```

- Put it behind HTTPS (nginx/Caddy) and set `TRUST_PROXY=1` and `PUBLIC_ORIGIN=https://your-domain`.
- Back up `data/` (database + uploaded images/receipts). SQLite online backup: `sqlite3 data/healthy-kitchen.db ".backup backup.db"`.
- Set real **delivery zones** and **ingredient costs/stock** in the admin before opening orders; the five planner dishes without a known
  price are seeded as unavailable drafts with price 0 and cannot be enabled until a price is set. Seed recipe quantities are reasonable
  starting points — have the kitchen confirm them in the meal builder.

## Project layout

```
shared/            business logic used by server AND browser (nutrition, money, order states, permissions, phone, units)
server/
  app.js           request pipeline (security headers, CSRF, sessions, rate limits, routing, errors)
  routes/          HTTP endpoints + input validation
  services/        business logic (orders, inventory, meals, payments, finance, analytics, whatsapp, …)
  integrations/    external providers (WhatsApp)
  db/              SQLite access, migrations, seed data
  test/            API-level tests
src/
  components/hero/HealthyKitchenApp.jsx   the original landing page, now wired to live data
  pages/           customer pages, pages/staff/*, pages/admin/*
  components/      ui kit, dashboard shell & widgets, domain components (badges, nutrition facts, timeline)
  i18n/            landing copy + messages.js (FR/AR for app screens)
```

## Security notes

Passwords hashed with scrypt; sessions are random tokens stored as SHA-256 in the database, sent as `HttpOnly; SameSite=Lax`
(`Secure` in production) cookies. State-changing requests must be JSON and same-origin (CSRF). Login, signup, ordering and tracking are
rate-limited. All input is validated server-side; uploads are type-checked by content and size-limited; receipts are private.
Tracking links use an unguessable token. Not yet implemented: password reset by email and 2-factor auth.
