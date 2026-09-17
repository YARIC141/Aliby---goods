-- Персональные тренировки: возможность задать диапазон приёма (не только
-- фиксированное время начала, как у групповых занятий) по отдельным дням
-- недели. Клиент затем выбирает удобное время внутри этого диапазона.
--
-- training_schedules.end_time:
--   групповое занятие  — не используется (NULL), конец = start_time + duration_minutes;
--   персональная тренировка — обязателен, вместе со start_time задаёт диапазон
--     приёма клиентов в этот день (day_of_week, как и раньше, 0=Пн..6=Вс).

ALTER TABLE training_schedules ADD COLUMN IF NOT EXISTS end_time TIME;

ALTER TABLE training_schedules
  DROP CONSTRAINT IF EXISTS training_schedules_end_after_start;
ALTER TABLE training_schedules
  ADD CONSTRAINT training_schedules_end_after_start
  CHECK (end_time IS NULL OR end_time > start_time);
