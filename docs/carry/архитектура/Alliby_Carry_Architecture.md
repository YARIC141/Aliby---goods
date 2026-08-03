# Alliby Carry — архитектура (по факту реализации, 2026-08-03)

Функциональное описание — см. `../функционал/Alliby_Carry_spec.md`. Этот документ — про то, как это реально работает в коде, а не как задумывалось.

## 1. Общая картина

- Единый self-hosted стек: одна VPS (89.169.39.31), один Supabase (Docker: `supabase-db`, Edge Runtime, PostgREST). Никакого отдельного Cloud-проекта нет — вся платформа (client/admin/carry/site) работает на одной инфраструктуре.
- Frontend — `carry/` (статическое SPA, `index.html`). Деплой — GitHub Actions рсинкает в `/var/www/alliby/carry/` на VPS, кэш service worker бампается по таймстампу тем же sed-паттерном, что у client/admin (`alliby-carry-app-v<ts>`).
- Нативная обёртка `Native shell Carry/` — Capacitor, `appId: ru.alliby_carry.app`. `capacitor.config.ts` указывает `server.url: https://carry.alliby.ru` — приложение грузит живой сайт, а не бандл. Значит правки в `carry/index.html` долетают до установленного приложения без пересборки APK; пересборка нужна только при изменении манифеста/иконок/`build.gradle`.

## 2. Модель данных

**`profiles` — курьер как флаг, не роль.** `is_courier boolean` (миграция `20240101000094_courier_as_flag_not_role.sql`) заменил более раннюю попытку `role='courier'` (`...089_carry_courier_profile.sql`), которая ломала гейтинг логина admin/employee (`role IN ('admin','employee')`). Плюс `courier_city`, `courier_min_reward`, `courier_lat/lng`, `courier_location_updated_at`, `courier_banned[_at/_reason]`. RLS раньше рекурсила — исправлено в `...093_fix_courier_profiles_rls_recursion.sql` через `SECURITY DEFINER`-хелпер `is_admin_or_employee()`.

**`stores`** (`...090_carry_dispatch_schema.sql`): `delivery_courier_mode` (`manual`|`own_courier`|`carry`), `delivery_carry_bid_mode` (`auction`|`first_found`), `delivery_search_radius_m`.

**`store_couriers`** — курируемый список курьеров для режима `own_courier`, PK `(store_id, courier_id)`.

**`order_courier_declines`** — журнал отказов курьера. С миграции `...100_courier_decline_not_permanent.sql` это только аудит: отказ больше не исключает курьера из повторного матчинга того же заказа.

**`orders`** — карри-поля: `is_delivery`, `delivery_fee`, `delivery_address`, `delivery_lat/lng`; `carry_courier_id`, `carry_courier_reward`, `carry_dispatch_status` (`none`|`assigned`|`no_couriers_found`), `carry_dispatched_at`; `carry_mode_snapshot`/`carry_bid_mode_snapshot`/`carry_search_radius_used_m` — снимок настроек стора, замороженный на момент первой диспетчеризации (переживает повторные попытки после отказа курьера); `carry_delivered_at`. RLS: курьер видит заказ, если `carry_courier_id = auth.uid()`; admin/employee не может напрямую выставить `status='issued'`, если заказ привязан к курьеру — это делает только `courier_mark_delivered()` (`SECURITY DEFINER`).

**`contract_signatures`**: значение `contract='courier'` — акцепт публичной оферты Carry (`site.alliby.ru/carry-terms`).

**`haversine_m(lat1,lng1,lat2,lng2)`** — расстояние обычной SQL-формулой, без PostGIS.

## 3. Алгоритм диспетчеризации

Центральная функция — `dispatch_order_courier(p_order_id)`.

Запускается тремя путями:
- `trg_carry_auto_dispatch` — при переходе заказа в `paid` (если `is_delivery`) сразу поднимает его в `looking_for_courier`.
- `trg_carry_dispatch` — при входе в `looking_for_courier` запускает подбор курьера.
- **Автоматический повторный ретрай** (`...108_retry_stuck_dispatch_on_ping.sql`): встроен прямо в `update_courier_location()` — при каждом пинге геолокации курьера функция заодно пересматривает все «зависшие» (`no_couriers_found`) заказы, которые этот курьер потенциально может закрыть. Продавцу для этого ничего нажимать не нужно — заказ переоценивается сам в момент, когда подходящий курьер выходит на связь.
- Ручной резерв: RPC `retry_courier_dispatch` (кнопка «Повторить поиск курьера» в `admin/index.html`), с `...104_retry_dispatch_resync_mode.sql` дополнительно сбрасывает замороженный снимок настроек — ручной ретрай берёт текущие настройки стора, а не старые.

Логика подбора кандидата:
- `manual` — диспетчеризация не запускается вовсе.
- `own_courier` — ближайший из `store_couriers`, не забанен, пинговался < 5 мин назад. Без ограничения по радиусу/занятости.
- `carry` — пул всех `is_courier=true` того же города, не забанен, есть координаты, `courier_min_reward <= delivery_fee` заказа, пинговался < 5 мин назад, в радиусе `delivery_search_radius_m`, не занят другим активным заказом. `FOR UPDATE OF p SKIP LOCKED` — защита от гонки при параллельном подборе. Режим `auction` — минимальная ставка курьера (плата = его ставка); `first_found` — ближайший (плата = полная `delivery_fee`).

Кандидат не найден → `carry_dispatch_status='no_couriers_found'`, заказ висит до ретрая (ручного или автоматического). Кандидат найден → назначение + push курьеру (`send-push`, тип `carry_order_assigned`) через `net.http_post` прямо из Postgres-функции.

## 4. Статусная модель заказа

`paid` → `looking_for_courier` → `handed_to_courier` (админ отмечает передачу курьеру) → `accepted_by_courier` (курьер нажимает «Принять», `courier_accept_order()`) → `issued` (курьер нажимает «Доставил», `courier_mark_delivered()`).

`on_the_way` сохранился только для manual-режима без привязанного carry-курьера (легаси-путь).

`courier_decline_order()` — отказ возможен из `looking_for_courier` или `handed_to_courier`; заказ уходит на повторный матчинг, отказавшийся курьер не исключается из следующего подбора (только логируется в `order_courier_declines`).

## 5. Геолокация курьера

**`carry/index.html`** — адаптивный пинг: 20 сек, если у курьера есть активный заказ в статусе `accepted_by_courier`/`on_the_way`; иначе 90 сек (базовый режим «на смене без заказа»). Реализован как самопереустанавливающийся `setTimeout` (не `setInterval`), поскольку интервал должен пересчитываться после каждого тика. `pingLocation()` → RPC `update_courier_location(p_lat, p_lng)` — та же функция, что запускает retry-логику из п.3.

**`client/index.html`** (просмотр клиентом) — кнопка «Посмотреть где курьер» видна только при `is_delivery && carry_courier_id && status ∈ {accepted_by_courier, on_the_way}`. Карта на MapLibre, опрос раз в 15 сек через RPC `get_order_courier_location(p_order_id)` — функция сама проверяет, что запрашивает владелец заказа и что статус подходящий, прежде чем отдать координаты.

## 6. Push-уведомления

Общая для всей платформы цепочка (не карри-специфичная инфраструктура, но карри её использует): DB-триггер/функция → `net.http_post` → `https://alliby.ru/functions/v1/send-push` (self-hosted Edge Function на той же VPS) → FCM HTTP v1 → Android. Карри-специфичные шаблоны внутри `send-push/index.ts`: `carry_order_assigned`, `carry_order_handed`. Отдельной edge-функции для Carry не существует — вся диспетчерская логика живёт в Postgres, единственный внешний вызов — сам `send-push`.

## 7. Регистрация и авторизация курьера

Обычная Supabase email/password регистрация (без отдельной edge-функции типа `admin-register`) + после акцепта оферты (`contract_signatures`, `contract='courier'`) вызывается RPC `register_courier()`, которая проставляет `is_courier=true`. `resign_courier()` (`...103`) — отдельный RPC, снимающий курьерский флаг без удаления всего аккаунта.

## 8. Экран заказов курьера

Два таба в `carry/index.html`: «Ожидают» (`looking_for_courier` + `handed_to_courier`) и «В работе» (`accepted_by_courier` + `on_the_way`), с живыми счётчиками на кнопках (`setOrderTab()`, `_carryOrderTab`).

## 9. Нативная обёртка

`Native shell Carry/`, `appId: ru.alliby_carry.app`. `server.url: https://carry.alliby.ru` (см. п.1). Плагины: `PushNotifications`, `StatusBar`, `SplashScreen`, `Geolocation` (только foreground — осознанное решение, нет фоновой слежки при свёрнутом приложении). `google-services.json` в `android/app/`, FCM `project_id: alliby-82a8b` — тот же, что у остальных приложений платформы.

## 10. Деплой

`.github/workflows/deploy.yml` рсинкает `carry/` наравне с `client/`, `admin/`, `site/`. Миграции применяются на той же VPS через `docker exec supabase-db psql`; edge-функции рсинкаются и контейнер пересоздаётся — обычный `git push` в `main`, без ручного `supabase functions deploy`.

## Известные ограничения

- Геолокация курьера — только foreground, нет фонового трекинга.
- Нет отдельного мониторинга/алертинга на застрявшие `no_couriers_found` заказы — только ручная кнопка и опортунистический ретрай при пинге курьера.
- Верификация личности курьера при регистрации отсутствует — см. `../вопросы-юриста/вопросы для юриста Alliby Carry.md`, вопрос 12.
