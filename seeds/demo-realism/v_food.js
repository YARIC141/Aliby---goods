// Витрина: общепит — бургерная с доставкой и кофейня с предзаказом.
const L = require('./lib');
const { sql, section, cat, renameCat, rename, item, optGroup, priceRule, q } = L;

const GRILL = 'e20925a7-6790-4c4c-996c-3e33f38d83f9';
const COFFEE = '3f486b97-c61e-4683-9894-7d60ef964d62';

// ─────────────────────────── БУРГЕРНАЯ «ГРИЛЬЯЖ» ───────────────────────────
section('Бургерная «Грильяж» — витрина общепита с доставкой');

sql(`UPDATE stores SET
  address='Самара, ул. Полевая, 14',
  phone='+7 846 220-11-42',
  working_hours='Ежедневно 10:00–00:00',
  is_visible=true, archived_at=NULL,
  delivery_enabled=true, accepts_online_payment=true,
  delivery_courier_mode='carry', delivery_search_radius_m=5000,
  preorder_enabled=true, preorder_opens='10:00', preorder_closes='22:30',
  preorder_weekdays='{1,2,3,4,5,6,7}', preorder_prep_minutes=25,
  avg_order_amount=850,
  legal_name='ООО «Грильяж»', inn='6316123456', ogrn='1156316012345',
  image_url=${q(L.img('burger3'))}
WHERE id=${q(GRILL)};`);

// В базе жили две почти одинаковые категории и позиция с опечаткой,
// на которой висит 78 заказов — её нельзя удалять, только привести в порядок.
renameCat(GRILL, 'Бургер', 'Бургеры-старая');
rename(GRILL, 'Бургергер', 'Двойной Грильяж');
rename(GRILL, 'Стол 4 - местный ', 'Столик на 4 персоны');
rename(GRILL, 'Стол 4 - местный', 'Столик на 4 персоны');

const gBurgers = cat(GRILL, 'Бургеры');
const gSnacks = cat(GRILL, 'Закуски');
const gSauces = cat(GRILL, 'Соусы');
const gDrinks = cat(GRILL, 'Напитки');
const gSweets = cat(GRILL, 'Десерты');
const gTables = cat(GRILL, 'Бронь столика');

const b1 = item(gBurgers, 'Классик', {
  desc: 'Говяжья котлета 150 г на углях, чеддер, томат, огурец, айсберг и фирменный соус в булочке бриошь.',
  price: 390, img: 'burger', prep: 12, hit: true, allerg: 'глютен, молоко, яйца, горчица',
  g: 280, kcal: 640, p: 32, f: 34, c: 48 });
const b2 = item(gBurgers, 'Двойной Чиз', {
  desc: 'Две говяжьи котлеты, двойной чеддер, карамелизованный лук и соус бургер.',
  price: 560, img: 'burger2', prep: 14, allerg: 'глютен, молоко, яйца',
  g: 380, kcal: 940, p: 52, f: 56, c: 52 });
const b3 = item(gBurgers, 'Двойной Грильяж', {
  desc: 'Фирменный: две котлеты по 150 г, бекон, чеддер, соус смоки BBQ и хрустящий лук.',
  price: 620, img: 'burger3', prep: 15, hit: true, allerg: 'глютен, молоко, яйца',
  g: 420, kcal: 1080, p: 58, f: 66, c: 58 });
const b4 = item(gBurgers, 'Смоки BBQ', {
  desc: 'Говяжья котлета, бекон, соус барбекю на копчёной паприке, лук фри, чеддер.',
  price: 490, old: 590, img: 'burger2', prep: 13, allerg: 'глютен, молоко, яйца',
  g: 320, kcal: 780, p: 38, f: 44, c: 54 });
const b5 = item(gBurgers, 'Чикен Криспи', {
  desc: 'Куриное филе в хрустящей панировке, айсберг, томат, соус ранч.',
  price: 380, img: 'burger', prep: 12, allerg: 'глютен, молоко, яйца',
  g: 290, kcal: 690, p: 34, f: 32, c: 62 });
const b6 = item(gBurgers, 'Веган Зелёный', {
  desc: 'Котлета из нута и шпината, авокадо, руккола, томат, веганский соус на тахини.',
  price: 430, img: 'salad', prep: 12, allerg: 'глютен, кунжут',
  g: 300, kcal: 520, p: 18, f: 22, c: 62 });
const b7 = item(gBurgers, 'Острый Халапеньо', {
  desc: 'Говяжья котлета, халапеньо, острый сырный соус, красный лук. Для тех, кто любит поострее.',
  price: 470, img: 'burger', prep: 13, allerg: 'глютен, молоко, яйца',
  g: 310, kcal: 760, p: 36, f: 42, c: 52 });
const b8 = item(gBurgers, 'Блю Чиз', {
  desc: 'Говяжья котлета, сыр с голубой плесенью, груша, руккола и медово-горчичный соус.',
  price: 520, img: 'burger2', prep: 14, allerg: 'глютен, молоко, яйца, горчица',
  g: 300, kcal: 810, p: 40, f: 50, c: 46 });

// Опции — на всех говяжьих бургерах одинаковый набор, чтобы клиент мог
// потрогать и radio (обязательный выбор), и checkbox (множественный).
[b1, b2, b3, b4, b7, b8].forEach(b => {
  optGroup(b, 'Прожарка котлеты', [['Medium', 0], ['Medium Well', 0], ['Well Done', 0]],
    { type: 'radio', required: true, sort: 0 });
  optGroup(b, 'Добавки', [['Бекон', 80], ['Двойной чеддер', 60], ['Халапеньо', 40], ['Яйцо', 50], ['Авокадо', 90]],
    { type: 'checkbox', required: false, sort: 1 });
  optGroup(b, 'Соус к бургеру', [['Фирменный', 0], ['Барбекю', 0], ['Чесночный', 0], ['Сырный', 20]],
    { type: 'radio', required: false, sort: 2 });
});
optGroup(b5, 'Добавки', [['Бекон', 80], ['Сыр чеддер', 60], ['Халапеньо', 40]], { type: 'checkbox', sort: 1 });
optGroup(b6, 'Добавки', [['Авокадо', 90], ['Вяленые томаты', 60]], { type: 'checkbox', sort: 1 });

const s1 = item(gSnacks, 'Картошка фри', {
  desc: 'Хрустящий картофель фри с морской солью.', price: 180, img: 'fries', prep: 7,
  g: 150, kcal: 430, p: 5, f: 21, c: 54 });
const s2 = item(gSnacks, 'Картошка по-деревенски', {
  desc: 'Дольки картофеля в кожуре со специями и розмарином.', price: 190, img: 'fries', prep: 8,
  g: 180, kcal: 400, p: 6, f: 17, c: 56 });
const s3 = item(gSnacks, 'Луковые кольца', {
  desc: 'Кольца лука в хрустящем кляре, подаются с соусом ранч.', price: 200, img: 'onion_rings', prep: 8,
  allerg: 'глютен, молоко', g: 140, kcal: 460, p: 7, f: 26, c: 48 });
const s4 = item(gSnacks, 'Наггетсы ×6', {
  desc: 'Куриные наггетсы в панировке, 6 штук.', price: 220, img: 'nuggets', prep: 9,
  allerg: 'глютен, яйца', g: 160, kcal: 420, p: 24, f: 22, c: 32 });
const s5 = item(gSnacks, 'Крылья BBQ ×6', {
  desc: 'Куриные крылья в глазури барбекю, 6 штук.', price: 320, img: 'wings', prep: 14, hit: true,
  g: 260, kcal: 620, p: 42, f: 38, c: 24 });
const s6 = item(gSnacks, 'Сырные шарики ×6', {
  desc: 'Моцарелла в хрустящей панировке с соусом на выбор.', price: 240, img: 'onion_rings', prep: 9,
  allerg: 'глютен, молоко, яйца', g: 150, kcal: 480, p: 20, f: 28, c: 36 });

optGroup(s5, 'Острота', [['Обычные', 0], ['Острые', 0], ['Очень острые', 0]], { type: 'radio', required: true });
[s1, s2].forEach(s => optGroup(s, 'Размер порции', [['Стандарт', 0], ['Большая', 70]], { type: 'radio', required: true }));

item(gSauces, 'Чили-сырный соус', { desc: 'Сырный соус с ноткой чили.', price: 80, img: 'sauce',
  allerg: 'молоко', g: 50, kcal: 140, p: 2, f: 13, c: 4 });
item(gSauces, 'Соус Барбекю', { desc: 'Классический соус барбекю.', price: 60, img: 'sauce',
  g: 50, kcal: 80, p: 0.5, f: 0.2, c: 19 });
item(gSauces, 'Соус Чесночный', { desc: 'Сливочный соус со свежим чесноком.', price: 60, img: 'sauce',
  allerg: 'молоко, яйца', g: 50, kcal: 210, p: 1, f: 22, c: 2 });
item(gSauces, 'Соус Ранч', { desc: 'Соус ранч на пахте с зеленью.', price: 70, img: 'sauce',
  allerg: 'молоко, яйца', g: 50, kcal: 190, p: 1, f: 19, c: 3 });

const d1 = item(gDrinks, 'Лимонад Тропик', {
  desc: 'Домашний лимонад с маракуйей и лаймом, 0,4 л.', price: 230, img: 'lemonade',
  g: 400, kcal: 180, p: 0, f: 0, c: 45 });
item(gDrinks, 'Морс клюквенный', { desc: 'Домашний морс из клюквы, 0,4 л.', price: 150, img: 'lemonade',
  g: 400, kcal: 140, p: 0.2, f: 0, c: 34 });
item(gDrinks, 'Кола 0,5 л', { desc: 'Газированный напиток, 0,5 л.', price: 120, img: 'cola',
  g: 500, kcal: 210, p: 0, f: 0, c: 53 });
const d4 = item(gDrinks, 'Шейк Vanilla', { desc: 'Молочный коктейль на пломбире с ванилью.', price: 250,
  img: 'milkshake', prep: 5, allerg: 'молоко', g: 350, kcal: 480, p: 11, f: 21, c: 62 });
const d5 = item(gDrinks, 'Шейк Шоколадный', { desc: 'Молочный коктейль с бельгийским шоколадом.', price: 260,
  img: 'milkshake', prep: 5, allerg: 'молоко', g: 350, kcal: 520, p: 12, f: 23, c: 68 });

[d4, d5].forEach(d => optGroup(d, 'Объём', [['0,3 л', 0], ['0,5 л', 90]], { type: 'radio', required: true }));
optGroup(d1, 'Лёд', [['Со льдом', 0], ['Без льда', 0]], { type: 'radio', required: true });

item(gSweets, 'Брауни с мороженым', { desc: 'Тёплый шоколадный брауни с шариком пломбира.', price: 240,
  img: 'brownie', prep: 6, allerg: 'глютен, молоко, яйца', g: 180, kcal: 520, p: 8, f: 26, c: 64 });
item(gSweets, 'Мороженое пломбир', { desc: 'Два шарика классического пломбира.', price: 150,
  img: 'icecream', allerg: 'молоко', g: 120, kcal: 260, p: 5, f: 15, c: 26 });

// Аренда столика — «условия» заведения: бронь на часы с депозитом.
item(gTables, 'Столик на 4 персоны', {
  desc: 'Бронь столика в зале на 4 персоны. Депозит списывается в счёт заказа.',
  price: 500, img: 'burger3', type: 'rental', rentUnit: 'hour', rentStep: 2, qty: 6 });
item(gTables, 'Столик на 8 персон', {
  desc: 'Большой стол для компании до 8 человек. Депозит списывается в счёт заказа.',
  price: 1200, img: 'burger3', type: 'rental', rentUnit: 'hour', rentStep: 2, qty: 2 });

// Бизнес-ланч: будни 12:00–16:00 — витрина покажет «от 290 ₽».
priceRule(b1, 'Бизнес-ланч', 290, [1, 2, 3, 4, 5], '12:00', '16:00');
priceRule(b5, 'Бизнес-ланч', 290, [1, 2, 3, 4, 5], '12:00', '16:00');
priceRule(s1, 'Бизнес-ланч', 120, [1, 2, 3, 4, 5], '12:00', '16:00');

// ───────────────────────────── ДЕМО КОФЕЙНЯ ─────────────────────────────
section('Демо Кофейня Alliby — предзаказ и абонементы');

sql(`UPDATE stores SET
  address='Самара, ул. Куйбышева, 91',
  phone='+7 846 205-77-30',
  working_hours='Пн–Пт 8:00–21:00, Сб–Вс 9:00–21:00',
  is_visible=true, archived_at=NULL,
  delivery_enabled=true, delivery_courier_mode='carry', delivery_search_radius_m=3000,
  accepts_online_payment=true,
  preorder_enabled=true, preorder_opens='07:30', preorder_closes='20:30',
  preorder_weekdays='{1,2,3,4,5,6,7}', preorder_prep_minutes=10,
  avg_order_amount=420,
  legal_name='ИП Соколова А. В.', inn='631812345678', ogrn='318631800012345',
  image_url=${q(L.img('coffee_cappuccino'))}
WHERE id=${q(COFFEE)};`);

const cCoffee = cat(COFFEE, 'Кофе');
const cTea = cat(COFFEE, 'Чай и какао');
const cBake = cat(COFFEE, 'Выпечка');
const cDess = cat(COFFEE, 'Десерты');
const cBreak = cat(COFFEE, 'Завтраки');

const k1 = item(cCoffee, 'Американо', { desc: 'Двойной эспрессо с горячей водой.', price: 180,
  img: 'coffee_americano', prep: 4, g: 250, kcal: 10, p: 0.3, f: 0, c: 1.7 });
const k2 = item(cCoffee, 'Капучино', { desc: 'Эспрессо и бархатное молоко с плотной пенкой.', price: 220,
  img: 'coffee_cappuccino', prep: 5, hit: true, allerg: 'молоко', g: 250, kcal: 140, p: 7, f: 7, c: 12 });
const k3 = item(cCoffee, 'Латте', { desc: 'Эспрессо с большим количеством молока и лёгкой пенкой.', price: 240,
  img: 'coffee_latte', prep: 5, allerg: 'молоко', g: 300, kcal: 180, p: 9, f: 8, c: 17 });
const k4 = item(cCoffee, 'Эспрессо', { desc: 'Классический эспрессо из зерна собственной обжарки.', price: 140,
  img: 'espresso', prep: 3, g: 40, kcal: 5, p: 0.2, f: 0, c: 0.8 });
const k5 = item(cCoffee, 'Раф ванильный', { desc: 'Эспрессо со сливками и ванильным сахаром.', price: 280,
  img: 'coffee_latte', prep: 6, allerg: 'молоко', g: 300, kcal: 320, p: 6, f: 21, c: 26 });
const k6 = item(cCoffee, 'Флэт уайт', { desc: 'Двойной эспрессо и микропена — плотный молочный вкус.', price: 260,
  img: 'espresso2', prep: 5, allerg: 'молоко', g: 200, kcal: 150, p: 8, f: 8, c: 11 });

// Кофейные опции — то, что реально спрашивают у стойки.
[k2, k3, k5, k6].forEach(k => {
  optGroup(k, 'Объём', [['250 мл', 0], ['350 мл', 50], ['450 мл', 90]], { type: 'radio', required: true, sort: 0 });
  optGroup(k, 'Молоко', [['Коровье', 0], ['Безлактозное', 40], ['Овсяное', 50], ['Миндальное', 60], ['Кокосовое', 60]],
    { type: 'radio', required: true, sort: 1 });
  optGroup(k, 'Сироп', [['Без сиропа', 0], ['Ваниль', 40], ['Карамель', 40], ['Лесной орех', 40], ['Солёная карамель', 50]],
    { type: 'radio', required: false, sort: 2 });
});
[k1, k4].forEach(k => optGroup(k, 'Объём', [['Стандарт', 0], ['Двойной', 60]], { type: 'radio', required: true }));

item(cTea, 'Чай облепиховый', { desc: 'Горячий облепиховый чай с мёдом и имбирём.', price: 260,
  img: 'tea', prep: 5, g: 400, kcal: 190, p: 0.5, f: 0.3, c: 46 });
item(cTea, 'Чай листовой', { desc: 'Чёрный или зелёный листовой чай, чайник 400 мл.', price: 190,
  img: 'teapot', prep: 5, g: 400, kcal: 5, p: 0, f: 0, c: 1 });
item(cTea, 'Какао на молоке', { desc: 'Горячее какао с маршмеллоу.', price: 240,
  img: 'coffee_latte', prep: 5, allerg: 'молоко', g: 300, kcal: 280, p: 8, f: 10, c: 38 });

item(cBake, 'Круассан с миндалём', { desc: 'Слоёный круассан с миндальным кремом и лепестками миндаля.',
  price: 210, img: 'croissant', allerg: 'глютен, молоко, яйца, орехи', g: 90, kcal: 380, p: 7, f: 22, c: 38 });
item(cBake, 'Круассан классический', { desc: 'Хрустящий слоёный круассан на сливочном масле.',
  price: 160, img: 'croissant', allerg: 'глютен, молоко, яйца', g: 70, kcal: 290, p: 6, f: 16, c: 31 });
item(cBake, 'Маффин черничный', { desc: 'Маффин со свежей черникой.', price: 180,
  img: 'muffin', allerg: 'глютен, молоко, яйца', g: 110, kcal: 350, p: 5, f: 14, c: 51 });
item(cBake, 'Печенье овсяное', { desc: 'Овсяное печенье с изюмом, 2 шт.', price: 120,
  img: 'cookie', allerg: 'глютен, молоко, яйца', g: 80, kcal: 340, p: 5, f: 13, c: 51 });
item(cBake, 'Сэндвич с индейкой', { desc: 'Зерновой хлеб, индейка, чеддер, томат, соус песто.', price: 320,
  img: 'sandwich', prep: 6, allerg: 'глютен, молоко, орехи', g: 220, kcal: 430, p: 26, f: 18, c: 42 });

item(cDess, 'Чизкейк Нью-Йорк', { desc: 'Классический чизкейк на песочной основе.', price: 260,
  img: 'cheesecake', hit: true, allerg: 'глютен, молоко, яйца', g: 130, kcal: 400, p: 7, f: 26, c: 34 });
item(cDess, 'Брауни', { desc: 'Плотный шоколадный брауни с орехом пекан.', price: 230,
  img: 'brownie', allerg: 'глютен, молоко, яйца, орехи', g: 120, kcal: 450, p: 6, f: 24, c: 54 });
item(cDess, 'Смузи ягодный', { desc: 'Смузи из клубники, банана и малины на йогурте.', price: 290,
  img: 'smoothie', prep: 5, allerg: 'молоко', g: 350, kcal: 240, p: 6, f: 3, c: 47 });

item(cBreak, 'Сырники со сметаной', { desc: 'Творожные сырники, подаются со сметаной и джемом.', price: 340,
  img: 'pancakes', prep: 12, allerg: 'глютен, молоко, яйца', g: 220, kcal: 480, p: 22, f: 20, c: 52 });
item(cBreak, 'Каша овсяная с бананом', { desc: 'Овсяная каша на молоке с бананом и мёдом.', price: 250,
  img: 'oatmeal', prep: 10, allerg: 'глютен, молоко', g: 300, kcal: 320, p: 11, f: 8, c: 52 });
item(cBreak, 'Завтрак «Классический»', { desc: 'Яичница из двух яиц, бекон, тост, свежие овощи.', price: 390,
  img: 'breakfast', prep: 14, hit: true, allerg: 'глютен, яйца, молоко', g: 280, kcal: 540, p: 26, f: 34, c: 30 });
item(cBreak, 'Скрэмбл с авокадо', { desc: 'Нежный скрэмбл, авокадо, зерновой тост.', price: 420,
  img: 'breakfast', prep: 12, allerg: 'глютен, яйца, молоко', g: 260, kcal: 470, p: 20, f: 30, c: 28 });

// Утренний кофе дешевле — повод показать правила цены и в общепите.
priceRule(k1, 'Утренний кофе до 11:00', 120, [1, 2, 3, 4, 5], '07:30', '11:00');
priceRule(k2, 'Утренний кофе до 11:00', 160, [1, 2, 3, 4, 5], '07:30', '11:00');
priceRule(k3, 'Утренний кофе до 11:00', 180, [1, 2, 3, 4, 5], '07:30', '11:00');

module.exports = { GRILL, COFFEE };
