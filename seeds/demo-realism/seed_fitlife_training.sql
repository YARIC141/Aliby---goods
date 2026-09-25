-- Тестовые данные для фичи «Тренировки» на втором реальном видимом магазине —
-- FitLife (id b388c526-061b-4ff5-95c0-9c9ebf611d31). До этого единственным
-- direction=sport магазином был КНТС (см. seed_knts_training.sql) — сюда же
-- переводим FitLife, чтобы в шорткатах «Спорт и образование» появилось
-- второе заведение другого типа (Фитнес, а не Клуб настольного тенниса).
-- Идемпотентно: UPDATE по уже существующим id (не создаём новые позиции),
-- training_schedules — ON CONFLICT(menu_item_id, day_of_week) DO UPDATE.
-- Требует применённых миграций 20260917000001_training_bookings.sql
-- и 20260918000001_training_personal_ranges.sql (end_time для персональных).
-- Тренеры (master_services) уже привязаны к этим позициям в v_services.js —
-- отдельно привязывать не нужно.

BEGIN;

-- ── Переклассификация магазина: services → sport ────────────────────────
-- 'Фитнес-центр' (services) → 'Фитнес' (sport), иначе магазин не попадёт
-- в шорткаты «Спорт и образование» (они фильтруют stores.direction='sport').
UPDATE stores SET
  direction = 'sport',
  store_category_id = '4669e1c7-1bf7-4cc2-a7aa-f38f2e6522ff'
WHERE id = 'b388c526-061b-4ff5-95c0-9c9ebf611d31';

-- ── Групповые занятия (training_mode='group') ───────────────────────────
-- «Йога» — ведёт Ольга Ким
UPDATE menu_items SET is_training = true, training_mode = 'group', max_group_size = 12
WHERE id = 'e07a4c0c-a406-1fac-8879-bd8140ac92f4';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time) VALUES
  ('e07a4c0c-a406-1fac-8879-bd8140ac92f4', 1, '19:00'), -- Вт
  ('e07a4c0c-a406-1fac-8879-bd8140ac92f4', 3, '19:00'), -- Чт
  ('e07a4c0c-a406-1fac-8879-bd8140ac92f4', 5, '10:00')  -- Сб
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time;

-- «Стретчинг» — ведут Ольга Ким и Марина Соболева
UPDATE menu_items SET is_training = true, training_mode = 'group', max_group_size = 12
WHERE id = 'e7df795f-f29d-b2ee-bda3-728a88f9d3b3';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time) VALUES
  ('e7df795f-f29d-b2ee-bda3-728a88f9d3b3', 0, '18:00'), -- Пн
  ('e7df795f-f29d-b2ee-bda3-728a88f9d3b3', 2, '18:00'), -- Ср
  ('e7df795f-f29d-b2ee-bda3-728a88f9d3b3', 4, '18:00')  -- Пт
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time;

-- «Кроссфит» — ведёт Денис Ерохин
UPDATE menu_items SET is_training = true, training_mode = 'group', max_group_size = 10
WHERE id = '2498432c-c37c-a30f-ca72-0d6dab23af5c';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time) VALUES
  ('2498432c-c37c-a30f-ca72-0d6dab23af5c', 0, '19:30'), -- Пн
  ('2498432c-c37c-a30f-ca72-0d6dab23af5c', 2, '19:30'), -- Ср
  ('2498432c-c37c-a30f-ca72-0d6dab23af5c', 4, '19:30'), -- Пт
  ('2498432c-c37c-a30f-ca72-0d6dab23af5c', 5, '12:00')  -- Сб
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time;

-- «Бокс» — ведёт Денис Ерохин
UPDATE menu_items SET is_training = true, training_mode = 'group', max_group_size = 10
WHERE id = '76884110-51ae-d139-3f65-565fffd9b201';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time) VALUES
  ('76884110-51ae-d139-3f65-565fffd9b201', 1, '20:00'), -- Вт
  ('76884110-51ae-d139-3f65-565fffd9b201', 3, '20:00'), -- Чт
  ('76884110-51ae-d139-3f65-565fffd9b201', 5, '13:00')  -- Сб
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time;

-- «Аквааэробика» — ведёт Марина Соболева
UPDATE menu_items SET is_training = true, training_mode = 'group', max_group_size = 15
WHERE id = '98a5e943-1ab4-d002-dae0-503da45b0991';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time) VALUES
  ('98a5e943-1ab4-d002-dae0-503da45b0991', 0, '20:00'), -- Пн
  ('98a5e943-1ab4-d002-dae0-503da45b0991', 2, '20:00'), -- Ср
  ('98a5e943-1ab4-d002-dae0-503da45b0991', 6, '11:00')  -- Вс
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time;

-- ── Персональные тренировки (training_mode='personal') ──────────────────
-- «Персональная тренировка» — один клиент на тренера (Денис/Марина/Ольга/Ярослав)
UPDATE menu_items SET is_training = true, training_mode = 'personal', max_group_size = 1
WHERE id = '5cda36eb-ecd2-4d1f-9ecd-e73ee3260f19';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time, end_time) VALUES
  ('5cda36eb-ecd2-4d1f-9ecd-e73ee3260f19', 0, '07:00', '22:00'), -- Пн
  ('5cda36eb-ecd2-4d1f-9ecd-e73ee3260f19', 1, '07:00', '22:00'), -- Вт
  ('5cda36eb-ecd2-4d1f-9ecd-e73ee3260f19', 2, '07:00', '22:00'), -- Ср
  ('5cda36eb-ecd2-4d1f-9ecd-e73ee3260f19', 3, '07:00', '22:00'), -- Чт
  ('5cda36eb-ecd2-4d1f-9ecd-e73ee3260f19', 4, '07:00', '22:00'), -- Пт
  ('5cda36eb-ecd2-4d1f-9ecd-e73ee3260f19', 5, '09:00', '21:00'), -- Сб
  ('5cda36eb-ecd2-4d1f-9ecd-e73ee3260f19', 6, '09:00', '21:00')  -- Вс
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;

-- «Персональная тренировка (сплит на двоих)» — только Ярослав Ярославов
UPDATE menu_items SET is_training = true, training_mode = 'personal', max_group_size = 2
WHERE id = '6ccf129f-efc5-14f7-4fba-0b71e23885ca';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time, end_time) VALUES
  ('6ccf129f-efc5-14f7-4fba-0b71e23885ca', 0, '15:00', '19:00'), -- Пн
  ('6ccf129f-efc5-14f7-4fba-0b71e23885ca', 2, '15:00', '19:00'), -- Ср
  ('6ccf129f-efc5-14f7-4fba-0b71e23885ca', 4, '15:00', '19:00'), -- Пт
  ('6ccf129f-efc5-14f7-4fba-0b71e23885ca', 5, '10:00', '16:00')  -- Сб
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;

COMMIT;
