// Витрина: товары — электроника с доставкой и арендой инструмента, аптека.
const L = require('./lib');
const { sql, section, cat, renameCat, item, optGroup, q } = L;

const TECH = 'e946ae49-4f35-4aaf-9998-aee183b58672';
const PHARM = 'f3bfb05a-ca5c-47a4-9fb6-8e27b6b4e8ad';

// ─────────────────────────────── ТЕХНОМАРКЕТ ───────────────────────────────
section('ТехноМаркет — товары, доставка и аренда инструмента');

sql(`UPDATE stores SET
  address='Самара, Московское шоссе, 81',
  phone='+7 846 300-45-12',
  working_hours='Пн–Сб 10:00–20:00, Вс 10:00–18:00',
  is_visible=true, archived_at=NULL,
  delivery_enabled=true, accepts_online_payment=true,
  delivery_courier_mode='carry', delivery_search_radius_m=8000,
  avg_order_amount=12400,
  legal_name='ООО «ТехноМаркет Волга»', inn='6318234567', ogrn='1176318023456',
  image_url=${q(L.img('tv'))}
WHERE id=${q(TECH)};`);

const tPhone = cat(TECH, 'Смартфоны');
const tLap = cat(TECH, 'Ноутбуки и планшеты');
const tAcc = cat(TECH, 'Аксессуары');
const tHome = cat(TECH, 'Техника для дома');
const tRent = cat(TECH, 'Аренда инструмента');

item(tPhone, 'Смартфон Samsung A55', {
  desc: '6,6" Super AMOLED 120 Гц, 8/256 ГБ, камера 50 Мп, аккумулятор 5000 мА·ч. Гарантия 24 месяца.',
  price: 29990, old: 34990, img: 'smartphone', hit: true });
item(tPhone, 'Смартфон Xiaomi Redmi 13', {
  desc: '6,79" IPS 90 Гц, 8/256 ГБ, камера 108 Мп, аккумулятор 5030 мА·ч. Гарантия 12 месяцев.',
  price: 17990, img: 'smartphone' });
item(tPhone, 'Смартфон Samsung S24', {
  desc: '6,2" Dynamic AMOLED 2X, 8/256 ГБ, Snapdragon 8 Gen 3. Флагман с гарантией 24 месяца.',
  price: 74990, img: 'smartphone' });

item(tLap, 'Ноутбук Lenovo IdeaPad 3', {
  desc: '15,6" FHD, Ryzen 5, 16/512 ГБ SSD. Для учёбы и работы.', price: 54990, old: 62990, img: 'laptop' });
item(tLap, 'Ноутбук ASUS VivoBook 16', {
  desc: '16" WUXGA, Core i5, 16/1024 ГБ SSD, подсветка клавиатуры.', price: 72990, img: 'laptop2', hit: true });
item(tLap, 'Планшет Samsung Tab A9+', {
  desc: '11" 90 Гц, 8/128 ГБ, стереодинамики. Отлично подходит для дома и детей.', price: 24990, img: 'tablet' });

item(tAcc, 'Беспроводные наушники JBL', {
  desc: 'TWS-наушники с шумоподавлением, до 30 часов работы с кейсом.', price: 2490, old: 3490, img: 'headphones', hit: true });
item(tAcc, 'Умные часы Xiaomi Band 9', {
  desc: 'AMOLED-экран, пульсометр, контроль сна, до 21 дня автономности.', price: 3490, img: 'smartwatch' });
item(tAcc, 'Powerbank 20000 мА·ч', {
  desc: 'Внешний аккумулятор с быстрой зарядкой 22,5 Вт и двумя выходами USB.', price: 2290, img: 'powerbank' });
item(tAcc, 'Клавиатура механическая', {
  desc: 'Механическая клавиатура, red-свитчи, RGB-подсветка, съёмный кабель USB-C.', price: 4990, img: 'keyboard' });
item(tAcc, 'Мышь беспроводная', {
  desc: 'Беспроводная мышь 2,4 ГГц, 1600 dpi, тихие клики.', price: 1290, img: 'mouse' });
item(tAcc, 'Монитор 27" IPS 165 Гц', {
  desc: '27" IPS QHD, 165 Гц, 1 мс — для работы и игр.', price: 27990, img: 'monitor' });

item(tHome, 'Телевизор 50" 4K', {
  desc: '50" 4K UHD Smart TV, HDR10, Wi-Fi. Настройка при доставке — бесплатно.', price: 39990, old: 45990, img: 'tv' });
item(tHome, 'Робот-пылесос', {
  desc: 'Робот-пылесос с влажной уборкой, лидарная навигация, станция самоочистки.', price: 28990, img: 'vacuum', hit: true });
item(tHome, 'Чайник электрический', {
  desc: 'Чайник 1,7 л, 2200 Вт, контроль температуры, стальная колба.', price: 3290, img: 'kettle' });
item(tHome, 'Портативная колонка', {
  desc: 'Bluetooth-колонка, защита IPX7, до 20 часов музыки.', price: 5990, img: 'speaker' });

// Аренда — сутки, с депозитом и ограниченным парком.
item(tRent, 'Аренда бензопилы', {
  desc: 'Бензопила 45 см³, шина 40 см. Залог 5000 ₽ возвращается при сдаче.',
  price: 500, img: 'drill', type: 'rental', rentUnit: 'day', rentStep: 1, qty: 5 });
item(tRent, 'Аренда перфоратора', {
  desc: 'Перфоратор SDS-Plus 900 Вт с набором буров. Залог 4000 ₽.',
  price: 450, img: 'drill', type: 'rental', rentUnit: 'day', rentStep: 1, qty: 4 });
item(tRent, 'Аренда шуруповёрта', {
  desc: 'Аккумуляторный шуруповёрт 18 В, два аккумулятора и кейс. Залог 2500 ₽.',
  price: 300, img: 'drill', type: 'rental', rentUnit: 'day', rentStep: 1, qty: 6 });
item(tRent, 'Аренда строительного пылесоса', {
  desc: 'Промышленный пылесос 1400 Вт, бак 30 л. Залог 4000 ₽.',
  price: 400, img: 'vacuum', type: 'rental', rentUnit: 'day', rentStep: 1, qty: 3 });

// Условия покупки техники — то, что реально выбирают в магазине.
optGroup({ storeId: TECH, name: 'Смартфон Samsung A55' }, 'Цвет',
  [['Графит', 0], ['Лавандовый', 0], ['Голубой', 0]], { type: 'radio', required: true });
optGroup({ storeId: TECH, name: 'Смартфон Samsung A55' }, 'Дополнительно',
  [['Защитное стекло с установкой', 690], ['Чехол-книжка', 990], ['Расширенная гарантия +12 мес.', 2990]],
  { type: 'checkbox', sort: 1 });
optGroup({ storeId: TECH, name: 'Телевизор 50" 4K' }, 'Установка',
  [['Без установки', 0], ['Настенный кронштейн + монтаж', 2500]], { type: 'radio', required: true });
optGroup({ storeId: TECH, name: 'Ноутбук ASUS VivoBook 16' }, 'Дополнительно',
  [['Установка ПО', 1500], ['Сумка для ноутбука', 1990], ['Расширенная гарантия +12 мес.', 4990]],
  { type: 'checkbox' });

// ───────────────────────────────── АПТЕКА ─────────────────────────────────
section('Аптека — товары повседневного спроса, Тольятти');

sql(`UPDATE stores SET
  name='Аптека «Здоровье»',
  address='Тольятти, ул. Революционная, 52',
  phone='+7 848 253-19-04',
  working_hours='Ежедневно 8:00–22:00',
  is_visible=true, archived_at=NULL, city='Тольятти',
  delivery_enabled=true, accepts_online_payment=true,
  delivery_courier_mode='carry', delivery_search_radius_m=4000,
  avg_order_amount=760,
  legal_name='ООО «Аптека Здоровье»', inn='6321345678', ogrn='1156320012345',
  image_url=${q(L.img('pharmacy'))}
WHERE id=${q(PHARM)};`);

// Категории «кукет» и «привет» — следы ручных тестов, приводим в порядок.
renameCat(PHARM, 'кукет', 'Витамины и БАД');
renameCat(PHARM, 'привет', 'Гигиена и уход');

const pMed = cat(PHARM, 'Лекарственные средства');
const pVit = cat(PHARM, 'Витамины и БАД');
const pHyg = cat(PHARM, 'Гигиена и уход');
const pBaby = cat(PHARM, 'Мама и малыш');
const pDev = cat(PHARM, 'Медтехника');

sql(`UPDATE menu_items SET name='Витамин C 500 мг, 60 таб.'
WHERE store_id=${q(PHARM)} AND name='Супер еда';`);

item(pMed, 'Парацетамол 500 мг, 20 таб.', {
  desc: 'Жаропонижающее и обезболивающее средство. Отпускается без рецепта.', price: 89, img: 'pills' });
item(pMed, 'Ибупрофен 400 мг, 20 таб.', {
  desc: 'Противовоспалительное и обезболивающее средство. Без рецепта.', price: 149, img: 'pills' });
item(pMed, 'Спрей для горла', {
  desc: 'Антисептический спрей для местного применения, 30 мл.', price: 320, img: 'medical' });
item(pMed, 'Капли в нос, 10 мл', {
  desc: 'Сосудосуживающие капли при насморке, 10 мл.', price: 178, img: 'medical' });
item(pMed, 'Уголь активированный, 50 таб.', {
  desc: 'Энтеросорбент при пищевых расстройствах.', price: 68, img: 'pills' });

item(pVit, 'Витамин C 500 мг, 60 таб.', {
  desc: 'Аскорбиновая кислота для поддержки иммунитета, 60 таблеток.', price: 250, img: 'vitamins', hit: true });
item(pVit, 'Витамин D3 2000 МЕ, 60 капс.', {
  desc: 'Поддержка костной ткани и иммунитета. Курс на 2 месяца.', price: 490, old: 620, img: 'vitamins' });
item(pVit, 'Омега-3, 90 капс.', {
  desc: 'Рыбий жир высокой очистки, 90 капсул.', price: 890, img: 'vitamins' });
item(pVit, 'Магний B6, 50 таб.', {
  desc: 'При повышенных нагрузках и стрессе.', price: 560, img: 'vitamins' });

item(pHyg, 'Антисептик для рук, 100 мл', {
  desc: 'Кожный антисептик на основе спирта, 100 мл.', price: 120, img: 'cream' });
item(pHyg, 'Маска медицинская, 50 шт.', {
  desc: 'Трёхслойная одноразовая маска, упаковка 50 штук.', price: 290, img: 'mask' });
item(pHyg, 'Крем для рук увлажняющий', {
  desc: 'Питательный крем с пантенолом, 75 мл.', price: 230, img: 'cream' });
item(pHyg, 'Бинт стерильный 5 м', {
  desc: 'Бинт марлевый медицинский стерильный, 5 м × 10 см.', price: 65, img: 'bandage' });

item(pBaby, 'Подгузники, 4–9 кг, 62 шт.', {
  desc: 'Детские подгузники размер S, дышащий слой, 62 штуки.', price: 1290, img: 'babycare', hit: true });
item(pBaby, 'Влажные салфетки детские, 72 шт.', {
  desc: 'Салфетки без спирта и отдушек, 72 штуки.', price: 180, img: 'babycare' });
item(pBaby, 'Крем под подгузник', {
  desc: 'Защитный крем с цинком и пантенолом, 75 мл.', price: 340, img: 'cream' });

item(pDev, 'Термометр электронный', {
  desc: 'Электронный термометр с гибким наконечником и звуковым сигналом.', price: 390, img: 'thermometer' });
item(pDev, 'Тонометр автоматический', {
  desc: 'Автоматический тонометр на плечо, память на 90 измерений.', price: 2790, old: 3290, img: 'tonometer' });
item(pDev, 'Пульсоксиметр', {
  desc: 'Портативный пульсоксиметр на палец, OLED-дисплей.', price: 1190, img: 'medical' });

module.exports = { TECH, PHARM };
