-- Тестовые данные для фичи «Тренировки» (группа/персональные) на реальном
-- видимом магазине КНТС (id 60b7a9af-905f-4b9d-9195-7f78c22dbf61, direction=sport).
-- Идемпотентно: UPDATE по уже существующим id позиций (не создаём новые),
-- training_schedules — ON CONFLICT(menu_item_id, day_of_week) DO UPDATE.
-- Требует применённых миграций 20260917000001_training_bookings.sql
-- и 20260918000001_training_personal_ranges.sql (end_time для персональных).

BEGIN;

-- ── Групповые тренировки ─────────────────────────────────────────────────
-- «Групповая тренировка (до 6 человек)» — ведут Наталья Ершова и Сергей Лапин
UPDATE menu_items SET is_training = true, training_mode = 'group', max_group_size = 6
WHERE id = '4a243390-5d1c-1073-461f-bfeb1e5f255a';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time) VALUES
  ('4a243390-5d1c-1073-461f-bfeb1e5f255a', 0, '18:00'), -- Пн
  ('4a243390-5d1c-1073-461f-bfeb1e5f255a', 3, '18:00'), -- Чт
  ('4a243390-5d1c-1073-461f-bfeb1e5f255a', 5, '11:00')  -- Сб
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time;

-- «Детская секция (7–14 лет)» — ведёт Наталья Ершова
UPDATE menu_items SET is_training = true, training_mode = 'group', max_group_size = 8
WHERE id = '162864e7-bf2b-f0a5-8cc5-90dc94b82cd3';

INSERT INTO training_schedules (menu_item_id, day_of_week, start_time) VALUES
  ('162864e7-bf2b-f0a5-8cc5-90dc94b82cd3', 1, '16:00'), -- Вт
  ('162864e7-bf2b-f0a5-8cc5-90dc94b82cd3', 4, '16:00')  -- Пт
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time;

-- ── Персональные тренировки ──────────────────────────────────────────────
-- «Занятия с инструктором 1 кат.» — ведёт только Владимир Будыко
UPDATE menu_items SET is_training = true, training_mode = 'personal', max_group_size = 3
WHERE id = '3bd3bca2-bf21-4820-ba9e-bc8056cd1b44';

-- Диапазон приёма: Пн/Ср/Пт первая половина дня
INSERT INTO training_schedules (menu_item_id, day_of_week, start_time, end_time) VALUES
  ('3bd3bca2-bf21-4820-ba9e-bc8056cd1b44', 0, '09:00', '13:00'), -- Пн
  ('3bd3bca2-bf21-4820-ba9e-bc8056cd1b44', 2, '09:00', '13:00'), -- Ср
  ('3bd3bca2-bf21-4820-ba9e-bc8056cd1b44', 4, '09:00', '13:00')  -- Пт
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;

-- «Занятия с инструктором 2 кат.» — ведут Наталья Ершова и Сергей Лапин
-- (два тренера на одну персональную услугу — тест выбора тренера + объединения диапазонов)
UPDATE menu_items SET is_training = true, training_mode = 'personal', max_group_size = 3
WHERE id = '37c512bb-6c6d-4c05-8f36-d79058efbcfe';

-- Диапазон приёма: Вт/Чт вечер, Сб утро-день
INSERT INTO training_schedules (menu_item_id, day_of_week, start_time, end_time) VALUES
  ('37c512bb-6c6d-4c05-8f36-d79058efbcfe', 1, '14:00', '19:00'), -- Вт
  ('37c512bb-6c6d-4c05-8f36-d79058efbcfe', 3, '14:00', '19:00'), -- Чт
  ('37c512bb-6c6d-4c05-8f36-d79058efbcfe', 5, '10:00', '14:00')  -- Сб
ON CONFLICT (menu_item_id, day_of_week) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;

COMMIT;
