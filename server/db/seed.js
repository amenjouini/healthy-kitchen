/**
 * Seed data.
 *
 * seedCatalog — safe for production. Recreates the dishes and "build your own" ingredients
 *   that the website already showed (same names, prices and images), now built from real
 *   ingredients. Nutrition values are standard per-100 g reference values (USDA FoodData
 *   Central). Recipe quantities are starting points the kitchen should review in the meal
 *   builder. Dishes that never had a price are created as UNAVAILABLE drafts with price 0.
 *   Ingredient costs, stock and delivery zones are left for the admin to enter.
 *
 * seedDemo — DEVELOPMENT ONLY. Adds costs, stock, delivery zones, demo staff accounts and
 *   ~60 days of synthetic orders so dashboards and analytics can be exercised. Never run it
 *   against the production database.
 */
import { createIngredient } from '../services/ingredients.js';
import { createMeal, updateMeal, upsertCategory } from '../services/meals.js';
import { upsertZone } from '../services/customers.js';
import { recordMovement } from '../services/inventory.js';
import { createOrder, transitionOrder } from '../services/orders.js';
import { markPaid } from '../services/payments.js';
import { createExpense, saveSalaryPayment } from '../services/finance.js';
import { upsertUserWithRole, seedSystemRoles } from '../services/users.js';
import { ALL_PERMISSIONS } from '../../shared/permissions.js';
import { nowIso } from './database.js';

const SYSTEM = { userId: null, ip: 'seed' };

// per 100 g: kcal, protein, carbs, fat, satFat, fiber, sugar, sodium(mg)
const n = (kcal, protein, carbs, fat, satFat, fiber, sugar, sodium) => ({ kcal, protein, carbs, fat, satFat, fiber, sugar, sodium });

export const CATALOG_INGREDIENTS = [
  { key: 'chicken', name: 'Poulet Bio', nameEn: 'Organic Chicken', nameAr: 'دجاج عضوي', detail: 'Élevage plein air · 31g protéines/100g', detailEn: 'Free-range · 31g protein per 100g', detailAr: 'تربية حرة · 31 غ بروتين/100 غ', baseUnit: 'g', nutrition: n(165, 31, 0, 3.6, 1.0, 0, 0, 74), selectable: { portionQty: 100, price: 8500, color: '#c8d8b0' } },
  { key: 'avocado', name: 'Avocat Mûr', nameEn: 'Ripe Avocado', nameAr: 'أفوكادو ناضج', detail: 'Graisses mono-insaturées · Vitamine E', detailEn: 'Monounsaturated fats · Vitamin E', detailAr: 'دهون أحادية · فيتامين E', baseUnit: 'g', nutrition: n(160, 2.0, 8.5, 14.7, 2.1, 6.7, 0.7, 7), selectable: { portionQty: 50, price: 4000, color: '#b8d4a8' } },
  { key: 'quinoa', name: 'Quinoa Heirloom', nameEn: 'Heirloom Quinoa', nameAr: 'كينوا أصيلة', detail: 'Protéine complète · Riche en fibres', detailEn: 'Complete protein · Fibre-rich', detailAr: 'بروتين كامل · غنية بالألياف', baseUnit: 'g', nutrition: n(120, 4.4, 21.3, 1.9, 0.2, 2.8, 0.9, 7), selectable: { portionQty: 100, price: 3500, color: '#d4c8a0' } },
  { key: 'salmon', name: 'Saumon Sauvage', nameEn: 'Wild Salmon', nameAr: 'سلمون بري', detail: 'Oméga-3 · Bon pour le cœur', detailEn: 'Omega-3 · Heart-healthy', detailAr: 'أوميغا-3 · صحة القلب', baseUnit: 'g', nutrition: n(208, 20.4, 0, 13.4, 3.1, 0, 0, 59), selectable: { portionQty: 100, price: 12000, color: '#c8b8a0' } },
  { key: 'sweetPotato', name: 'Patate Douce', nameEn: 'Sweet Potato', nameAr: 'بطاطا حلوة', detail: 'Bêta-carotène · Glucides complexes', detailEn: 'Beta-carotene · Complex carbs', detailAr: 'بيتا كاروتين · كربوهيدرات معقدة', baseUnit: 'g', nutrition: n(86, 1.6, 20.1, 0.1, 0, 3.0, 4.2, 55), selectable: { portionQty: 100, price: 2500, color: '#d4b890' } },
  { key: 'spinach', name: 'Épinards Tendres', nameEn: 'Baby Spinach', nameAr: 'سبانخ طازجة', detail: 'Fer · Folate · Antioxydants', detailEn: 'Iron · Folate · Antioxidants', detailAr: 'حديد · حمض الفوليك · مضادات أكسدة', baseUnit: 'g', nutrition: n(23, 2.9, 3.6, 0.4, 0.1, 2.2, 0.4, 79), selectable: { portionQty: 100, price: 1500, color: '#b0c8a0' } },
  { key: 'romaine', name: 'Laitue Romaine', nameEn: 'Romaine Lettuce', nameAr: 'خس روماني', baseUnit: 'g', nutrition: n(17, 1.2, 3.3, 0.3, 0, 2.1, 1.2, 8) },
  { key: 'orange', name: 'Orange', nameEn: 'Orange', nameAr: 'برتقال', baseUnit: 'g', nutrition: n(47, 0.9, 11.8, 0.1, 0, 2.4, 9.4, 0) },
  { key: 'cucumber', name: 'Concombre', nameEn: 'Cucumber', nameAr: 'خيار', baseUnit: 'g', nutrition: n(15, 0.7, 3.6, 0.1, 0, 0.5, 1.7, 2) },
  { key: 'tomato', name: 'Tomates Cerises', nameEn: 'Cherry Tomatoes', nameAr: 'طماطم كرزية', baseUnit: 'g', nutrition: n(18, 0.9, 3.9, 0.2, 0, 1.2, 2.6, 5) },
  { key: 'oliveOil', name: "Huile d'Olive Vierge Extra", nameEn: 'Extra Virgin Olive Oil', nameAr: 'زيت زيتون بكر ممتاز', baseUnit: 'ml', gramsPerUnit: 0.91, nutrition: n(884, 0, 0, 100, 13.8, 0, 0, 2) },
  { key: 'lemon', name: 'Jus de Citron', nameEn: 'Lemon Juice', nameAr: 'عصير ليمون', baseUnit: 'ml', gramsPerUnit: 1.03, nutrition: n(22, 0.4, 6.9, 0.2, 0, 0.3, 2.5, 1) },
  { key: 'tahini', name: 'Tahini', nameEn: 'Tahini', nameAr: 'طحينة', baseUnit: 'g', nutrition: n(595, 17, 21.2, 53.8, 7.5, 9.3, 0.5, 115) },
  { key: 'bulgur', name: 'Boulgour Cuit', nameEn: 'Cooked Bulgur', nameAr: 'برغل مطبوخ', baseUnit: 'g', nutrition: n(83, 3.1, 18.6, 0.2, 0, 4.5, 0.1, 5) },
  { key: 'chickpeas', name: 'Pois Chiches Cuits', nameEn: 'Cooked Chickpeas', nameAr: 'حمص مطبوخ', baseUnit: 'g', nutrition: n(164, 8.9, 27.4, 2.6, 0.3, 7.6, 4.8, 7) },
  { key: 'banana', name: 'Banane', nameEn: 'Banana', nameAr: 'موز', baseUnit: 'g', nutrition: n(89, 1.1, 22.8, 0.3, 0.1, 2.6, 12.2, 1) },
  { key: 'apple', name: 'Pomme', nameEn: 'Apple', nameAr: 'تفاح', baseUnit: 'g', nutrition: n(52, 0.3, 13.8, 0.2, 0, 2.4, 10.4, 1) },
  { key: 'almondMilk', name: "Lait d'Amande Non Sucré", nameEn: 'Unsweetened Almond Milk', nameAr: 'حليب لوز غير محلى', baseUnit: 'ml', gramsPerUnit: 1.0, nutrition: n(15, 0.6, 0.6, 1.1, 0.1, 0.2, 0, 72) },
  { key: 'chia', name: 'Graines de Chia', nameEn: 'Chia Seeds', nameAr: 'بذور الشيا', baseUnit: 'g', nutrition: n(486, 16.5, 42.1, 30.7, 3.3, 34.4, 0, 16) },
  { key: 'almonds', name: 'Amandes', nameEn: 'Almonds', nameAr: 'لوز', baseUnit: 'g', nutrition: n(579, 21.2, 21.6, 49.9, 3.8, 12.5, 4.4, 1) },
  { key: 'egg', name: 'Œuf', nameEn: 'Egg', nameAr: 'بيض', baseUnit: 'pc', gramsPerUnit: 50, nutrition: n(143, 12.6, 0.7, 9.5, 3.1, 0, 0.4, 142) },
  { key: 'feta', name: 'Feta', nameEn: 'Feta', nameAr: 'جبن فيتا', baseUnit: 'g', nutrition: n(264, 14.2, 4.1, 21.3, 14.9, 0, 4.1, 917) },
];

const UNSPLASH = (id, w = 1200) => `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;

export const CATALOG_MEALS = [
  { name: 'Salade Verdure', nameEn: 'Verdure Salad', nameAr: 'سلطة الخضار', category: 'salads', price: 18500, featured: true, available: true,
    description: 'Jeunes pousses, agrumes, microherbes', descriptionEn: 'Heirloom greens, citrus, microherbs', descriptionAr: 'خضار طازجة، حمضيات، أعشاب دقيقة',
    tag: 'Saisonnier', tagEn: 'Seasonal', tagAr: 'موسمي', image: UNSPLASH('photo-1512621776951-a57141f2eefd'),
    recipe: { romaine: 120, spinach: 40, orange: 80, cucumber: 60, tomato: 60, avocado: 50, oliveOil: 10, lemon: 10, almonds: 10 } },
  { name: 'Bol Protéiné', nameEn: 'Protein Harvest', nameAr: 'طبق البروتين', category: 'bowls', price: 24000, featured: true, available: true,
    description: 'Poulet grillé, céréales anciennes, tahini', descriptionEn: 'Grilled chicken, ancient grain, tahini', descriptionAr: 'دجاج مشوي، حبوب قديمة، طحينة',
    tag: 'Choix du Chef', tagEn: "Chef's Pick", tagAr: 'اختيار الشيف', image: UNSPLASH('photo-1512058564366-18510be2db19'),
    recipe: { chicken: 150, bulgur: 120, spinach: 30, tomato: 50, cucumber: 40, tahini: 15, lemon: 10 } },
  { name: 'Élixir Forêt', nameEn: 'Forest Elixir', nameAr: 'إكسير الغابة', category: 'drinks', price: 12000, featured: true, available: true,
    description: 'Pressé à froid, épinards, banane, chia', descriptionEn: 'Cold-pressed, spinach, banana, chia', descriptionAr: 'عصير بارد، سبانخ، موز، شيا',
    tag: 'Nouveau', tagEn: 'New', tagAr: 'جديد', image: UNSPLASH('photo-1505252585461-04db1eb84625'),
    recipe: { spinach: 40, banana: 100, apple: 80, almondMilk: 200, chia: 10 } },
  // Drafts: shown in the old planner without a price → unavailable until an admin sets one.
  { name: 'Bol Vert Énergie', nameEn: 'Green Power Bowl', nameAr: 'طبق الطاقة الخضراء', category: 'bowls', price: 0, available: false,
    tag: 'Équilibré', tagEn: 'Balanced', tagAr: 'متوازن', image: UNSPLASH('photo-1546793665-c74683f339c1'),
    recipe: { quinoa: 120, chicken: 100, avocado: 50, spinach: 40, chickpeas: 60, oliveOil: 8 } },
  { name: 'Assiette Détox Agrumes', nameEn: 'Citrus Detox Plate', nameAr: 'طبق ديتوكس الحمضيات', category: 'salads', price: 0, available: false,
    tag: 'Léger', tagEn: 'Light', tagAr: 'خفيف', image: UNSPLASH('photo-1540420773420-3366772f4999'),
    recipe: { romaine: 80, orange: 120, cucumber: 80, chickpeas: 50, lemon: 10, oliveOil: 5 } },
  { name: 'Bol Oméga Saumon', nameEn: 'Salmon Omega Bowl', nameAr: 'طبق سلمون أوميغا', category: 'bowls', price: 0, available: false,
    tag: 'Riche Protéines', tagEn: 'High Protein', tagAr: 'غني بالبروتين', image: UNSPLASH('photo-1467003909585-2f8a72700288'),
    recipe: { salmon: 150, quinoa: 120, avocado: 50, spinach: 30, lemon: 10 } },
  { name: 'Assiette Quinoa', nameEn: 'Quinoa Harvest Plate', nameAr: 'طبق كينوا الحصاد', category: 'plates', price: 0, available: false,
    tag: 'Équilibré', tagEn: 'Balanced', tagAr: 'متوازن', image: UNSPLASH('photo-1490645935967-10de6ba17061'),
    recipe: { quinoa: 150, sweetPotato: 120, chickpeas: 60, spinach: 30, tahini: 10, oliveOil: 5 } },
  { name: 'Bol Avocat Nourrissant', nameEn: 'Avocado Nourish Bowl', nameAr: 'طبق الأفوكادو المغذي', category: 'bowls', price: 0, available: false,
    tag: 'Céto-Friendly', tagEn: 'Keto-Friendly', tagAr: 'كيتو', image: UNSPLASH('photo-1512621776951-a57141f2eefd'),
    recipe: { avocado: 100, egg: 2, spinach: 50, feta: 30, oliveOil: 10, almonds: 15 } },
];

const CATEGORIES = [
  { key: 'bowls', name: 'Bols', nameEn: 'Bowls', nameAr: 'أطباق', sortOrder: 1 },
  { key: 'salads', name: 'Salades', nameEn: 'Salads', nameAr: 'سلطات', sortOrder: 2 },
  { key: 'plates', name: 'Assiettes', nameEn: 'Plates', nameAr: 'صحون', sortOrder: 3 },
  { key: 'drinks', name: 'Boissons', nameEn: 'Drinks', nameAr: 'مشروبات', sortOrder: 4 },
];

/** Idempotent: does nothing when meals already exist. */
export function seedCatalog(db) {
  seedSystemRoles(db);
  if (db.get('SELECT COUNT(*) AS c FROM meals').c > 0) return { skipped: true };
  return db.tx(() => {
    const categoryIds = {};
    for (const c of CATEGORIES) {
      const existing = db.get('SELECT id FROM categories WHERE key = ?', c.key);
      categoryIds[c.key] = existing?.id ?? upsertCategory(db, SYSTEM, null, c);
      db.run('UPDATE categories SET key = ? WHERE id = ?', c.key, categoryIds[c.key]);
    }
    const ingredientIds = {};
    for (const ing of CATALOG_INGREDIENTS) {
      const created = createIngredient(db, SYSTEM, {
        name: ing.name, nameEn: ing.nameEn, nameAr: ing.nameAr, detail: ing.detail, detailEn: ing.detailEn, detailAr: ing.detailAr,
        baseUnit: ing.baseUnit, gramsPerUnit: ing.gramsPerUnit ?? 1, nutrition: ing.nutrition, reorderLevel: 0,
        customerSelectable: Boolean(ing.selectable), portionQty: ing.selectable?.portionQty ?? null,
        portionPriceMillimes: ing.selectable?.price ?? null, color: ing.selectable?.color ?? null,
      });
      ingredientIds[ing.key] = created.id;
    }
    CATALOG_MEALS.forEach((m, i) => {
      createMeal(db, SYSTEM, {
        name: m.name, nameEn: m.nameEn, nameAr: m.nameAr, description: m.description ?? null, descriptionEn: m.descriptionEn ?? null,
        descriptionAr: m.descriptionAr ?? null, tag: m.tag, tagEn: m.tagEn, tagAr: m.tagAr, categoryId: categoryIds[m.category],
        imageUrl: m.image, priceMillimes: m.price, servings: 1, isAvailable: m.available, isFeatured: Boolean(m.featured), sortOrder: i,
        recipe: Object.entries(m.recipe).map(([key, quantity]) => ({ ingredientId: ingredientIds[key], quantity })),
      });
    });
    return { ingredients: CATALOG_INGREDIENTS.length, meals: CATALOG_MEALS.length };
  });
}

// ─── Demo data (development only) ────────────────────────────────────────────

const DEMO_COST_PER_KG = { chicken: 26, avocado: 18, quinoa: 14, salmon: 75, sweetPotato: 4, spinach: 6, romaine: 4, orange: 3, cucumber: 2.5, tomato: 6, oliveOil: 22, lemon: 8, tahini: 30, bulgur: 4, chickpeas: 6, banana: 7, apple: 6, almondMilk: 12, chia: 60, almonds: 55, egg: 0.45, feta: 32 };
const DEMO_STOCK = { chicken: 40000, avocado: 15000, quinoa: 30000, salmon: 12000, sweetPotato: 20000, spinach: 15000, romaine: 15000, orange: 20000, cucumber: 15000, tomato: 15000, oliveOil: 10000, lemon: 5000, tahini: 4000, bulgur: 20000, chickpeas: 15000, banana: 20000, apple: 15000, almondMilk: 30000, chia: 3000, almonds: 4000, egg: 300, feta: 5000 };
const DEMO_PRICES = { 'Green Power Bowl': 22000, 'Citrus Detox Plate': 16000, 'Salmon Omega Bowl': 32000, 'Quinoa Harvest Plate': 20000, 'Avocado Nourish Bowl': 21000 };
const DEMO_ZONES = [['Tunis', 5000, 20000], ['Ariana', 6000, 20000], ['La Marsa', 7000, 25000], ['Ben Arous', 7000, 25000], ['Manouba', 8000, 30000]];

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export async function seedDemo(db, { password = 'demo-password' } = {}) {
  seedCatalog(db);
  if (db.get(`SELECT 1 FROM users WHERE email = 'manager@demo.local'`)) return { skipped: true };
  const admin = await upsertUserWithRole(db, { email: 'admin@demo.local', name: 'Demo Admin', password, roleKey: 'super_admin' });
  const managerId = await upsertUserWithRole(db, { email: 'manager@demo.local', name: 'Sami (Manager)', password, roleKey: 'manager' });
  const staffId = await upsertUserWithRole(db, { email: 'staff@demo.local', name: 'Ines (Kitchen)', password, roleKey: 'staff' });
  await upsertUserWithRole(db, { email: 'customer@demo.local', name: 'Yasmine B.', password, roleKey: 'customer' });
  const actor = { userId: admin, ip: 'seed' };
  const staffActor = { userId: staffId, ip: 'seed' };
  const allPerms = ALL_PERMISSIONS;

  db.tx(() => {
    db.run(`INSERT OR IGNORE INTO customers (name, phone, email, user_id, city, address, created_at, updated_at)
      SELECT name, '21655000001', email, id, 'Tunis', '12 Rue de Marseille', ?, ? FROM users WHERE email = 'customer@demo.local'`, nowIso(), nowIso());
    for (const [userId, title, salary] of [[managerId, 'Kitchen manager', 1800000], [staffId, 'Cook', 1100000]]) {
      db.run(`INSERT OR REPLACE INTO staff_profiles (user_id, job_title, hire_date, salary_millimes, salary_period, updated_at) VALUES (?, ?, '2025-09-01', ?, 'monthly', ?)`, userId, title, salary, nowIso());
    }
    DEMO_ZONES.forEach(([city, fee, min], i) => upsertZone(db, actor, null, { city, feeMillimes: fee, minOrderMillimes: min, sortOrder: i }));
    for (const ing of CATALOG_INGREDIENTS) {
      const row = db.get('SELECT * FROM ingredients WHERE name = ?', ing.name);
      const perUnit = ing.baseUnit === 'pc' ? DEMO_COST_PER_KG[ing.key] * 1000 : DEMO_COST_PER_KG[ing.key];
      db.run('UPDATE ingredients SET cost_per_unit = ?, reorder_level = ? WHERE id = ?', perUnit, DEMO_STOCK[ing.key] * 0.1, row.id);
      recordMovement(db, actor, { ingredientId: row.id, type: 'opening', quantity: DEMO_STOCK[ing.key] * 3, reason: 'Demo opening stock', unitCost: perUnit });
    }
    for (const m of db.all('SELECT id FROM meals')) updateMeal(db, actor, m.id, { versionReason: 'Demo costs' });
    for (const [nameEn, price] of Object.entries(DEMO_PRICES)) {
      const m = db.get('SELECT id FROM meals WHERE name_en = ?', nameEn);
      updateMeal(db, actor, m.id, { priceMillimes: price, isAvailable: true });
    }
  });

  // ~60 days of synthetic orders with realistic daily/hourly patterns.
  const rand = rng(42);
  const meals = db.all('SELECT id, name_en FROM meals WHERE is_available = 1');
  const zones = db.all('SELECT id, city FROM delivery_zones');
  const names = ['Amira', 'Youssef', 'Leila', 'Karim', 'Nour', 'Mehdi', 'Salma', 'Omar', 'Rania', 'Aziz', 'Hela', 'Walid', 'Mariem', 'Fares', 'Ons', 'Bilel', 'Sarra', 'Hamza', 'Emna', 'Anis'];
  const customers = Array.from({ length: 45 }, (_, i) => ({ name: `${names[i % names.length]} ${String.fromCharCode(65 + (i % 26))}.`, phone: `2169${String(8000000 + i * 7919).slice(0, 7)}` }));
  const days = 60;
  let created = 0;
  for (let d = days; d >= 0; d -= 1) {
    const perDay = 3 + Math.floor(rand() * 5) + (d < 14 ? 2 : 0);
    for (let k = 0; k < perDay; k += 1) {
      const hour = rand() < 0.45 ? 12 + Math.floor(rand() * 2) : rand() < 0.6 ? 19 + Math.floor(rand() * 2) : 9 + Math.floor(rand() * 12);
      const at = new Date(Date.now() - d * 86400_000);
      at.setUTCHours(hour - 1, Math.floor(rand() * 60), 0, 0);
      if (at > new Date()) continue;
      const customer = customers[Math.floor(Math.pow(rand(), 1.6) * customers.length)];
      const zone = zones[Math.floor(Math.pow(rand(), 1.4) * zones.length)];
      const itemCount = 1 + Math.floor(rand() * 3);
      const items = [];
      for (let j = 0; j < itemCount; j += 1) {
        const meal = meals[Math.floor(Math.pow(rand(), 1.3) * meals.length)];
        if (!items.find((it) => it.mealId === meal.id)) items.push({ mealId: meal.id, quantity: 1 + Math.floor(rand() * 2) });
      }
      const source = rand() < 0.45 ? 'whatsapp' : rand() < 0.85 ? 'web' : 'phone';
      const pickup = rand() < 0.15;
      let order;
      try {
        order = createOrder(db, {
          items, customer, fulfillment: pickup ? 'pickup' : 'delivery', zoneId: pickup ? undefined : zone.id, address: pickup ? undefined : 'Demo address',
          paymentMethod: rand() < 0.3 ? 'online' : 'cash', source, paymentStatus: 'pending',
        }, { actor: staffActor, isStaff: true });
      } catch { continue; }
      const roll = rand();
      const isRecent = d === 0 && rand() < 0.6;
      const path = isRecent ? ['accepted', 'preparing'].slice(0, Math.floor(rand() * 3))
        : roll < 0.07 ? ['refused'] : roll < 0.11 ? ['accepted', 'cancelled'] : ['accepted', 'preparing', 'ready', 'completed'];
      for (const to of path) {
        transitionOrder(db, order.id, to, {
          reason: to === 'refused' ? ['insufficient_stock', 'outside_delivery_area', 'operational_issue'][Math.floor(rand() * 3)] : to === 'cancelled' ? 'customer_request' : undefined,
        }, { actor: staffActor, permissions: allPerms });
      }
      const o = db.get('SELECT * FROM orders WHERE id = ?', order.id);
      if (o.status === 'completed') markPaid(db, actor, allPerms, o.id, { reference: o.payment_method === 'online' ? `DEMO-${o.id}` : undefined });
      // Back-date everything belonging to this order to the simulated time.
      const ts = at.toISOString();
      const later = new Date(at.getTime() + 40 * 60_000).toISOString();
      db.run('UPDATE orders SET created_at = ?, updated_at = ?, status_changed_at = ?, completed_at = CASE WHEN completed_at IS NOT NULL THEN ? END WHERE id = ?', ts, later, isRecent ? nowIso() : later, later, o.id);
      db.run('UPDATE order_status_history SET created_at = ? WHERE order_id = ?', ts, o.id);
      db.run('UPDATE payments SET created_at = ?, paid_at = CASE WHEN paid_at IS NOT NULL THEN ? END WHERE order_id = ?', ts, later, o.id);
      db.run('UPDATE inventory_movements SET created_at = ? WHERE order_id = ?', ts, o.id);
      db.run('UPDATE inventory_reservations SET created_at = ?, updated_at = ? WHERE order_id = ?', ts, later, o.id);
      created += 1;
    }
  }
  // Some waste, expenses and salaries so finance and waste analytics have data.
  const spinach = db.get(`SELECT id FROM ingredients WHERE name_en = 'Baby Spinach'`);
  recordMovement(db, actor, { ingredientId: spinach.id, type: 'spoilage', quantity: -3000, reason: 'Wilted batch (demo)' });
  const today = nowIso().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  for (const [category, amount, description, date] of [
    ['rent', 2500000, 'Kitchen rent', monthAgo], ['packaging', 420000, 'Compostable bowls x1000', monthAgo], ['utilities', 310000, 'Electricity & gas', today],
    ['marketing', 250000, 'Instagram ads', today], ['delivery', 380000, 'Delivery partner invoice', today], ['equipment', 900000, 'Blender replacement', monthAgo],
  ]) createExpense(db, actor, { category, amountMillimes: amount, expenseDate: date, description: `${description} (demo)` });
  const period = monthAgo.slice(0, 7);
  for (const userId of [managerId, staffId]) {
    const salary = db.get('SELECT salary_millimes FROM staff_profiles WHERE user_id = ?', userId).salary_millimes;
    saveSalaryPayment(db, actor, null, { userId, period, amountMillimes: salary, status: 'paid', paidAt: `${period}-28` });
  }
  // Synthetic history should not flood the notification centre or the WhatsApp outbox.
  db.run('DELETE FROM notifications');
  db.run('DELETE FROM outbound_messages');
  return { orders: created, accounts: ['admin@demo.local', 'manager@demo.local', 'staff@demo.local', 'customer@demo.local'], password };
}
