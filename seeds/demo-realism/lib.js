// Общие помощники генератора демо-данных Alliby.
// Принцип: всё идемпотентно. Существующие позиции не пересоздаём (их id
// держат заказы и записи — order_items имеет ON DELETE RESTRICT), а
// обновляем по паре (store_id, name); новые вставляем с детерминированным id.
const crypto = require('crypto');

const uid = key => {
  const h = crypto.createHash('md5').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

const q = v => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `'{${v.map(x => `"${String(x).replace(/"/g, '\\"')}"`).join(',')}}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const IMG = {};
require('fs').readFileSync(__dirname + '/img_results.txt', 'utf8')
  .split('\n').filter(l => l.startsWith('200|'))
  .forEach(l => { const [, key, id] = l.trim().split('|'); IMG[key] = id; });

// Фото берём только из проверенного пула: ключ, которого нет, — ошибка сборки,
// а не молчаливо битая картинка на витрине.
const img = key => {
  if (key === null) return null;
  if (!IMG[key]) throw new Error('Нет проверенного фото для ключа: ' + key);
  return `https://images.unsplash.com/photo-${IMG[key]}?w=900&q=80&auto=format&fit=crop`;
};

const out = [];
const sql = s => out.push(s);
const section = t => sql(`\n-- ${'='.repeat(66)}\n-- ${t}\n-- ${'='.repeat(66)}`);

// Категория: заводим по имени, id детерминированный.
function cat(storeId, name, sortHint) {
  const id = uid(`cat:${storeId}:${name}`);
  sql(`INSERT INTO categories (id, store_id, name)
SELECT ${q(id)}, ${q(storeId)}, ${q(name)}
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE store_id=${q(storeId)} AND name=${q(name)});`);
  return { storeId, name };
}

// Переименование существующей позиции — до upsert'а, чтобы обновление
// нашло её по новому имени и не создало дубль.
function rename(storeId, from, to) {
  sql(`UPDATE menu_items SET name=${q(to)} WHERE store_id=${q(storeId)} AND name=${q(from)};`);
}

function renameCat(storeId, from, to) {
  sql(`UPDATE categories SET name=${q(to)} WHERE store_id=${q(storeId)} AND name=${q(from)};`);
}

const ITEM_COLS = [
  'description', 'price', 'image_url', 'is_available', 'is_visible', 'preparation_time',
  'allergens', 'duration_minutes', 'rent_period_unit', 'rent_period_step',
  'total_quantity', 'quantity_available', 'item_type', 'is_hit', 'old_price',
  'portion_g', 'calories', 'protein', 'fat', 'carbs',
];

function item(catRef, name, o = {}) {
  const storeId = catRef.storeId;
  const id = uid(`item:${storeId}:${name}`);
  const catSel = `(SELECT id FROM categories WHERE store_id=${q(storeId)} AND name=${q(catRef.name)} LIMIT 1)`;
  const v = {
    description: o.desc ?? null,
    price: o.price,
    image_url: o.img === undefined ? null : img(o.img),
    is_available: o.avail ?? true,
    is_visible: o.vis ?? true,
    preparation_time: o.prep ?? 0,
    allergens: o.allerg ?? null,
    duration_minutes: o.dur ?? null,
    rent_period_unit: o.rentUnit ?? null,
    rent_period_step: o.rentStep ?? null,
    total_quantity: o.qty ?? null,
    quantity_available: o.qty ?? null,
    item_type: o.type ?? 'product',
    is_hit: o.hit ?? false,
    old_price: o.old ?? null,
    portion_g: o.g ?? null,
    calories: o.kcal ?? null,
    protein: o.p ?? null,
    fat: o.f ?? null,
    carbs: o.c ?? null,
  };
  sql(`INSERT INTO menu_items (id, store_id, category_id, name, ${ITEM_COLS.join(', ')})
SELECT ${q(id)}, ${q(storeId)}, ${catSel}, ${q(name)}, ${ITEM_COLS.map(k => q(v[k])).join(', ')}
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE store_id=${q(storeId)} AND name=${q(name)});
UPDATE menu_items SET category_id=${catSel}, ${ITEM_COLS.map(k => `${k}=${q(v[k])}`).join(', ')}
WHERE store_id=${q(storeId)} AND name=${q(name)};`);
  return { storeId, name, id };
}

// Группа опций товара (соусы, молоко, размер). Привязываемся к позиции
// подзапросом по имени, т.к. у уже существующих позиций id чужой.
function optGroup(itemRef, gname, opts, o = {}) {
  const itemSel = `(SELECT id FROM menu_items WHERE store_id=${q(itemRef.storeId)} AND name=${q(itemRef.name)} LIMIT 1)`;
  const gid = uid(`og:${itemRef.storeId}:${itemRef.name}:${gname}`);
  sql(`DELETE FROM menu_item_option_groups WHERE menu_item_id=${itemSel} AND name=${q(gname)};
INSERT INTO menu_item_option_groups (id, menu_item_id, name, type, required, sort_order)
VALUES (${q(gid)}, ${itemSel}, ${q(gname)}, ${q(o.type ?? 'radio')}, ${q(o.required ?? false)}, ${q(o.sort ?? 0)});`);
  opts.forEach(([oname, add, avail], i) => {
    sql(`INSERT INTO menu_item_options (id, group_id, name, price_add, sort_order, is_available)
VALUES (${q(uid(`opt:${gid}:${oname}`))}, ${q(gid)}, ${q(oname)}, ${q(add)}, ${q(i)}, ${q(avail ?? true)});`);
  });
}

// Правило цены по времени (бизнес-ланч, ночной тариф, утренние часы).
function priceRule(itemRef, label, price, days, from, to, priority = 0) {
  const itemSel = `(SELECT id FROM menu_items WHERE store_id=${q(itemRef.storeId)} AND name=${q(itemRef.name)} LIMIT 1)`;
  sql(`DELETE FROM item_price_rules WHERE item_id=${itemSel} AND label=${q(label)};
INSERT INTO item_price_rules (id, item_id, store_id, label, price, days, time_from, time_to, priority)
VALUES (${q(uid(`pr:${itemRef.storeId}:${itemRef.name}:${label}`))}, ${itemSel}, ${q(itemRef.storeId)},
        ${q(label)}, ${q(price)}, ${q(days)}, ${q(from)}, ${q(to)}, ${q(priority)});`);
}

module.exports = { uid, q, img, sql, section, cat, renameCat, rename, item, optGroup, priceRule, out };
