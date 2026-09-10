// Витрина: спорт и развлечения — клуб настольного тенниса и компьютерный клуб.
const L = require('./lib');
const { sql, section, cat, rename, item, optGroup, priceRule, q } = L;
const M = require('./lib_master');

const KNTS = '60b7a9af-905f-4b9d-9195-7f78c22dbf61';
const APEX = 'd7878acb-2ed1-4c88-b677-ef186fbaa9a1';

// ────────────────────────────────── КНТС ──────────────────────────────────
section('КНТС — клуб настольного тенниса: столы, тренеры, секции');

sql(`UPDATE stores SET
  address='Самара, ул. Физкультурная, 101',
  phone='+7 846 205-33-18',
  working_hours='Пн–Пт 08:00–23:00, Сб–Вс 09:00–22:00',
  is_visible=true, archived_at=NULL, allow_unpaid_booking=true,
  accepts_online_payment=true,
  avg_order_amount=1400,
  legal_name='АНО «Клуб настольного тенниса Самара»', inn='6318765432', ogrn='1206300012345',
  image_url=${q(L.img('pingpong'))}
WHERE id=${q(KNTS)};`);

// «Стол» и «Напитки» — заготовки первых тестов, доводим до нормальных названий.
rename(KNTS, 'Стол', 'Теннисный стол, 1 час');
rename(KNTS, 'Напитки', 'Вода негазированная 0,5 л');

const kTable = cat(KNTS, 'Аренда столов');
const kCoach = cat(KNTS, 'Занятия с инструктором');
const kGroup = cat(KNTS, 'Секции и группы');
const kServ = cat(KNTS, 'Услуги');
const kRent = cat(KNTS, 'Аренда инвентаря');
const kShop = cat(KNTS, 'Товары');

item(kTable, 'Теннисный стол, 1 час', {
  desc: 'Стол Donic Waldner в общем зале. Мячи выдаём на стойке, ракетки можно взять в аренду.',
  price: 550, img: 'pingpong', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 8, hit: true });
item(kTable, 'Стол в PRO-зоне, 1 час', {
  desc: 'Профессиональный стол Stiga с зонированным освещением и высоким потолком. Для спарринга и подготовки.',
  price: 750, img: 'sport_hall', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 3 });
item(kTable, 'Аренда зала целиком, 1 час', {
  desc: 'Все 11 столов, раздевалки и судейский стол. Для турниров и корпоративов. Бронь от 2 часов.',
  price: 3500, img: 'sport_hall', type: 'rental', rentUnit: 'hour', rentStep: 2, qty: 1 });

item(kCoach, 'Занятия с инструктором 1 кат.', {
  desc: 'Индивидуальная тренировка с тренером высшей категории: техника, работа ног, тактика. 60 минут.',
  price: 1200, dur: 60, type: 'service', img: 'trainer', hit: true });
item(kCoach, 'Занятия с инструктором 2 кат.', {
  desc: 'Индивидуальная тренировка с тренером второй категории. Подходит для начинающих. 60 минут.',
  price: 850, dur: 60, type: 'service', img: 'pingpong' });
item(kCoach, 'Спарринг с инструктором', {
  desc: 'Игровая практика на счёт с разбором ошибок после каждой партии. 60 минут.',
  price: 1000, dur: 60, type: 'service', img: 'sport_hall' });
item(kCoach, 'Разбор техники по видео', {
  desc: 'Съёмка игры на камеру 120 к/с и покадровый разбор с тренером. 45 минут.',
  price: 1500, old: 1900, dur: 45, type: 'service', img: 'trainer' });

item(kGroup, 'Групповая тренировка (до 6 человек)', {
  desc: 'Группа взрослых любого уровня: разминка, упражнения на столах, игровая часть. 90 минут.',
  price: 500, dur: 90, type: 'service', img: 'sport_hall' });
item(kGroup, 'Детская секция (7–14 лет)', {
  desc: 'Занятие детской группы под руководством тренера. Ракетки предоставляем. 60 минут.',
  price: 450, dur: 60, type: 'service', img: 'pingpong' });
item(kGroup, 'Клубный турнир выходного дня', {
  desc: 'Участие в рейтинговом турнире клуба по круговой системе. Стартовый взнос включает мячи и судейство.',
  price: 700, dur: 240, type: 'service', img: 'tournament' });

item(kServ, 'Сборка ракетки', {
  desc: 'Подбор основания и накладок под ваш стиль, поклейка и обрезка. 20 минут.',
  price: 500, dur: 20, type: 'service', img: 'pingpong' });
item(kServ, 'Переклейка накладок', {
  desc: 'Снятие старых накладок, очистка основания, поклейка новых. 15 минут.',
  price: 400, dur: 15, type: 'service', img: 'pingpong' });

item(kRent, 'Аренда ракетки, 1 час', {
  desc: 'Клубная ракетка среднего уровня. Залог не требуется.',
  price: 100, img: 'pingpong', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 20 });
item(kRent, 'Аренда робота-подавальщика, 1 час', {
  desc: 'Робот с программируемым вращением и частотой подачи. Только в PRO-зоне.',
  price: 400, img: 'sport_hall', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 2 });

item(kShop, 'Теннисные мячи (3 шт.)', {
  desc: 'Тренировочные мячи 40+, 3 штуки в упаковке.', price: 350, img: 'pingpong' });
item(kShop, 'Набор для тенниса', {
  desc: 'Две ракетки, три мяча и чехол — комплект для начинающих.', price: 2500, old: 2900, img: 'pingpong' });
item(kShop, 'Теннисная форма', {
  desc: 'Игровая футболка и шорты клубной расцветки, размеры S–XXL.', price: 3200, img: 'sportswear' });
item(kShop, 'Вода негазированная 0,5 л', {
  desc: 'Питьевая вода, 0,5 л.', price: 90, img: 'water_bottle', g: 500, kcal: 0, p: 0, f: 0, c: 0 });
item(kShop, 'Изотоник 0,5 л', {
  desc: 'Спортивный напиток с электролитами, цитрус.', price: 160, img: 'energy_drink',
  g: 500, kcal: 110, p: 0, f: 0, c: 27 });
item(kShop, 'Протеиновый батончик', {
  desc: 'Батончик 20 г белка, без сахара.', price: 190, img: 'nutrition_bar',
  g: 60, kcal: 214, p: 20, f: 7.4, c: 16 });

optGroup({ storeId: KNTS, name: 'Теннисная форма' }, 'Размер',
  [['S', 0], ['M', 0], ['L', 0], ['XL', 0], ['XXL', 0]], { type: 'radio', required: true });
optGroup({ storeId: KNTS, name: 'Набор для тенниса' }, 'Уровень набора',
  [['Начальный', 0], ['Любительский', 800], ['Продвинутый', 2000]], { type: 'radio', required: true });

// Днём в будни зал пустой, вечером — очередь. Разводим спрос ценой.
priceRule({ storeId: KNTS, name: 'Теннисный стол, 1 час' }, 'Дневной тариф', 350, [1, 2, 3, 4, 5], '08:00', '16:00', 10);
priceRule({ storeId: KNTS, name: 'Теннисный стол, 1 час' }, 'Вечерний тариф', 700, [1, 2, 3, 4, 5], '18:00', '23:00', 20);
priceRule({ storeId: KNTS, name: 'Стол в PRO-зоне, 1 час' }, 'Дневной тариф', 500, [1, 2, 3, 4, 5], '08:00', '16:00', 10);

const kVladimir = M.master(KNTS, { name: 'Владимир Будыко', login: 'knts_vladimir', photo: 'p_man2',
  bio: 'Главный тренер клуба, мастер спорта. 20 лет тренерского стажа, готовит спортсменов к первенству области.' });
const kSergey = M.master(KNTS, { name: 'Сергей Лапин', login: 'knts_sergey', photo: 'p_man4',
  bio: 'Тренер второй категории. Работает с новичками и любителями, ставит хват и подачу с нуля.' });
const kNatalia = M.master(KNTS, { name: 'Наталья Ершова', login: 'knts_natalia', photo: 'p_woman5',
  bio: 'Тренер детской секции, КМС. Группы 7–14 лет, подготовка к юношеским соревнованиям.' });

M.schedule(kVladimir, [[1, '15:00', '22:00'], [2, '15:00', '22:00'], [3, '15:00', '22:00'], [4, '15:00', '22:00'], [6, '10:00', '17:00']]);
M.schedule(kSergey, [[1, '09:00', '15:00'], [3, '09:00', '15:00'], [5, '09:00', '15:00'], [6, '10:00', '18:00'], [0, '11:00', '18:00']]);
M.schedule(kNatalia, [[2, '14:00', '20:00'], [4, '14:00', '20:00'], [5, '14:00', '20:00'], [0, '10:00', '15:00']]);

M.services(kVladimir, [['Занятия с инструктором 1 кат.', 1200], ['Спарринг с инструктором', 1000],
  ['Разбор техники по видео', 1500], ['Сборка ракетки', 500], ['Переклейка накладок', 400]]);
M.services(kSergey, [['Занятия с инструктором 2 кат.', 850], ['Групповая тренировка (до 6 человек)', 500],
  ['Спарринг с инструктором', 900], ['Сборка ракетки', 500]]);
M.services(kNatalia, [['Детская секция (7–14 лет)', 450], ['Занятия с инструктором 2 кат.', 850],
  ['Групповая тренировка (до 6 человек)', 500]]);

// ─────────────────────────── КОМПЬЮТЕРНЫЙ КЛУБ APEX ───────────────────────────
section('Компьютерный клуб Apex — ПК, консоли, VR, турниры');

sql(`UPDATE stores SET
  address='Самара, ул. Победы, 89',
  phone='+7 846 990-12-24',
  working_hours='Круглосуточно',
  is_visible=true, archived_at=NULL, allow_unpaid_booking=true,
  accepts_online_payment=true,
  delivery_enabled=true, delivery_courier_mode='manual', delivery_search_radius_m=2500,
  avg_order_amount=980,
  legal_name='ИП Гейм Даниил Олегович', inn='631900112233', ogrn='321631200011223',
  image_url=${q(L.img('gaming_setup'))}
WHERE id=${q(APEX)};`);

const aPc = cat(APEX, 'Аренда ПК');
const aConsole = cat(APEX, 'Приставки');
const aRoom = cat(APEX, 'Приватные комнаты');
const aVr = cat(APEX, 'VR-зона');
const aClass = cat(APEX, 'Мастер-классы');
const aSnack = cat(APEX, 'Снэки и напитки');

item(aPc, 'Игровой ПК Standard (RTX 3060)', {
  desc: 'i5-12400F, 16 ГБ, RTX 3060, монитор 165 Гц. Цена за час в общем зале.',
  price: 150, img: 'gaming_pc', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 24 });
item(aPc, 'Игровой ПК Pro (RTX 4080)', {
  desc: 'i7-13700K, 32 ГБ, RTX 4080, монитор 240 Гц, кресло DXRacer. Цена за час.',
  price: 300, img: 'gaming_setup', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 10, hit: true });
item(aPc, 'Bootcamp-место, 1 час', {
  desc: 'Место в тренировочной зоне для команд: своя периферия, отдельный сервер и голосовая связь.',
  price: 250, img: 'gaming_chair', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 5 });

item(aConsole, 'PlayStation 5 + 2 геймпада', {
  desc: 'PS5 на телевизоре 65", библиотека из 40 игр, два геймпада. Цена за час.',
  price: 250, img: 'console', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 4 });
item(aConsole, 'Xbox Series X + 2 геймпада', {
  desc: 'Xbox Series X с Game Pass Ultimate, два геймпада. Цена за час.',
  price: 220, img: 'console', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 3 });
item(aConsole, 'Настольные игры, 1 час', {
  desc: 'Полка из 60 настолок и стол на 6 человек. Правила объяснит администратор.',
  price: 120, img: 'board_games', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 4 });

item(aRoom, 'Приватная комната (до 4 человек)', {
  desc: 'Отдельная комната с 4 ПК Pro, кондиционером и своим входом. Цена за час за комнату.',
  price: 800, img: 'esports', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 3 });
item(aRoom, 'Комната для дня рождения, 3 часа', {
  desc: 'Комната на 8 человек, торт-зона, два часа игры и турнир между гостями. Пакет на 3 часа.',
  price: 4500, old: 5400, img: 'esports2', type: 'rental', rentUnit: 'hour', rentStep: 3, qty: 1 });

item(aVr, 'VR-зона, 30 минут', {
  desc: 'Meta Quest 3 на площадке 4×4 м, инструктаж и подбор игры. Цена за получасовой сеанс.',
  price: 500, img: 'vr', type: 'rental', rentUnit: 'hour', rentStep: 1, qty: 2, hit: true });
item(aVr, 'VR-квест для компании (до 4 человек)', {
  desc: 'Кооперативный VR-квест на 4 игроков с ведущим. 60 минут.',
  price: 2800, dur: 60, type: 'service', img: 'vr' });

item(aClass, 'Индивидуальный инструктаж по игре', {
  desc: 'Разбор ваших матчей с тренером по CS2 или Dota 2, план тренировок на неделю. 60 минут.',
  price: 1200, dur: 60, type: 'service', img: 'esports' });
item(aClass, 'Тренировка команды (5 человек)', {
  desc: 'Работа с составом: расстановки, тайминги, разбор демо. 120 минут.',
  price: 4000, dur: 120, type: 'service', img: 'esports2' });
item(aClass, 'Участие в турнире клуба', {
  desc: 'Стартовый взнос в еженедельный турнир. Призовой фонд формируется из взносов.',
  price: 400, dur: 180, type: 'service', img: 'tournament' });

item(aSnack, 'Хот-дог', {
  desc: 'Булочка, сосиска, горчица и жареный лук. Приносим прямо к компьютеру.',
  price: 250, img: 'hotdog', g: 190, kcal: 480, p: 17, f: 26, c: 42, allerg: ['глютен', 'горчица'] });
item(aSnack, 'Чипсы Lay\'s', {
  desc: 'Пачка 140 г, вкус на выбор.', price: 150, img: 'chips', g: 140, kcal: 754, p: 8.4, f: 43, c: 74 });
item(aSnack, 'Кола 0.5 л', {
  desc: 'Газированный напиток, 0,5 л, охлаждённый.', price: 120, img: 'cola', g: 500, kcal: 210, p: 0, f: 0, c: 53 });
item(aSnack, 'Энергетик Adrenaline Rush', {
  desc: 'Энергетический напиток 0,5 л. До 18 лет не продаём.', price: 180, img: 'energy_drink',
  g: 500, kcal: 230, p: 0, f: 0, c: 57 });
item(aSnack, 'Пицца пепперони, 30 см', {
  desc: 'Пицца из соседней пиццерии, привозим за 20 минут. Целиком, 8 кусков.',
  price: 690, img: 'pizza', g: 700, kcal: 1890, p: 78, f: 84, c: 196, allerg: ['глютен', 'молоко'] });

optGroup({ storeId: APEX, name: 'Чипсы Lay\'s' }, 'Вкус',
  [['Сметана и зелень', 0], ['Краб', 0], ['Сыр', 0], ['Паприка', 0]], { type: 'radio', required: true });
optGroup({ storeId: APEX, name: 'Хот-дог' }, 'Добавки',
  [['Двойная сосиска', 90], ['Сыр', 50], ['Халапеньо', 40], ['Без лука', 0]], { type: 'checkbox' });
optGroup({ storeId: APEX, name: 'Игровой ПК Pro (RTX 4080)' }, 'Периферия',
  [['Клубная мышь и клавиатура', 0], ['Своя периферия', 0], ['Наушники HyperX', 50]], { type: 'radio', required: true });

// Ночь и утро — «мёртвые» часы клуба, тариф ниже.
priceRule({ storeId: APEX, name: 'Игровой ПК Standard (RTX 3060)' }, 'Ночной тариф', 90, [0, 1, 2, 3, 4, 5, 6], '02:00', '08:00', 20);
priceRule({ storeId: APEX, name: 'Игровой ПК Standard (RTX 3060)' }, 'Утренний тариф', 110, [1, 2, 3, 4, 5], '08:00', '14:00', 10);
priceRule({ storeId: APEX, name: 'Игровой ПК Pro (RTX 4080)' }, 'Ночной тариф', 190, [0, 1, 2, 3, 4, 5, 6], '02:00', '08:00', 20);

const aDaniil = M.master(APEX, { name: 'Даниил Гейм', login: 'apex_daniil', photo: 'p_man6',
  bio: 'Владелец клуба и тренер по киберспорту. Бывший игрок полупро-состава по CS, ведёт VR-квесты.' });
const aKirill = M.master(APEX, { name: 'Кирилл Соловьёв', login: 'apex_kirill', photo: 'p_man3',
  bio: 'Тренер по Dota 2, 6000 MMR. Разбор драфта и карты, работа с саппорт-ролями.' });
const aAlisa = M.master(APEX, { name: 'Алиса Вершинина', login: 'apex_alisa', photo: 'p_woman1',
  bio: 'Администратор и ведущая турниров. Проводит детские дни рождения и VR-квесты для компаний.' });

M.schedule(aDaniil, [[2, '14:00', '23:00'], [3, '14:00', '23:00'], [4, '14:00', '23:00'], [5, '14:00', '23:00'], [6, '12:00', '22:00']]);
M.schedule(aKirill, [[1, '16:00', '23:00'], [3, '16:00', '23:00'], [5, '16:00', '23:00'], [0, '13:00', '21:00']]);
M.schedule(aAlisa, [[1, '10:00', '18:00'], [2, '10:00', '18:00'], [4, '10:00', '18:00'], [6, '10:00', '20:00'], [0, '10:00', '20:00']]);

M.services(aDaniil, [['Индивидуальный инструктаж по игре', 1200], ['Тренировка команды (5 человек)', 4000],
  ['VR-квест для компании (до 4 человек)', 2800], ['Участие в турнире клуба', 400]]);
M.services(aKirill, [['Индивидуальный инструктаж по игре', 1400], ['Тренировка команды (5 человек)', 4500]]);
M.services(aAlisa, [['VR-квест для компании (до 4 человек)', 2800], ['Участие в турнире клуба', 400]]);

module.exports = { KNTS, APEX };
