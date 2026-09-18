-- Фикс 1: personal_training_match_proposal падал с ошибкой 42702
-- (ambiguous_column). Причина: RETURNS TABLE теперь содержит колонку
-- duration_minutes, которая в plpgsql становится переменной-выходом
-- функции, и это имя совпадает с реальной колонкой menu_items.duration_minutes.
-- "SELECT duration_minutes ... FROM menu_items" стало неоднозначным.
-- Фикс — квалифицировать колонки алиасом таблицы.
CREATE OR REPLACE FUNCTION public.personal_training_match_proposal(p_master_id UUID, p_menu_item_id UUID, p_date DATE)
RETURNS TABLE (
  proposed_start TIME,
  proposed_end TIME,
  matched_booking_ids UUID[],
  matched_count INTEGER,
  window_start TIME,
  window_end TIME,
  duration_minutes INTEGER
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_duration    INTEGER;
  v_max_group   INTEGER;
  v_dow         SMALLINT;
  v_work_start  TIME;
  v_work_end    TIME;
  v_candidates  TIME[];
  c             TIME;
  v_ids         UUID[];
  v_cnt         INTEGER;
  v_best_start  TIME;
  v_best_count  INTEGER := 0;
  v_best_ids    UUID[]  := '{}';
  v_win_lo      TIME;
  v_win_hi      TIME;
BEGIN
  IF NOT (
    p_master_id = auth.uid()
    OR public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = p_master_id
        AND (public.is_store_owner_of(p.employee_store_id) OR public.is_employee_of(p.employee_store_id))
    )
  ) THEN
    RAISE EXCEPTION 'Недостаточно прав' USING ERRCODE = '42501';
  END IF;

  SELECT mi.duration_minutes, mi.max_group_size INTO v_duration, v_max_group
    FROM public.menu_items mi WHERE mi.id = p_menu_item_id;
  IF v_duration IS NULL THEN v_duration := 60; END IF;
  IF v_max_group IS NULL THEN v_max_group := 1; END IF;

  v_dow := (EXTRACT(ISODOW FROM p_date)::INTEGER - 1);

  SELECT start_time, end_time INTO v_work_start, v_work_end
    FROM public.master_schedules
    WHERE master_id = p_master_id AND day_of_week = v_dow;
  IF v_work_start IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT t) INTO v_candidates FROM (
    SELECT GREATEST(preferred_start, v_work_start) AS t
      FROM public.bookings
      WHERE status = 'pending_approval' AND master_id = p_master_id
        AND menu_item_id = p_menu_item_id AND slot_date = p_date
    UNION
    SELECT LEAST(
        (preferred_end   - (v_duration || ' minutes')::interval)::time,
        (v_work_end      - (v_duration || ' minutes')::interval)::time
      ) AS t
      FROM public.bookings
      WHERE status = 'pending_approval' AND master_id = p_master_id
        AND menu_item_id = p_menu_item_id AND slot_date = p_date
  ) s
  WHERE t IS NOT NULL
    AND t >= v_work_start
    AND (t + (v_duration || ' minutes')::interval)::time <= v_work_end;

  IF v_candidates IS NULL THEN
    RETURN;
  END IF;

  FOREACH c IN ARRAY v_candidates LOOP
    SELECT array_agg(id ORDER BY created_at), count(*) INTO v_ids, v_cnt
      FROM public.bookings
      WHERE status = 'pending_approval' AND master_id = p_master_id
        AND menu_item_id = p_menu_item_id AND slot_date = p_date
        AND preferred_start <= c
        AND preferred_end   >= (c + (v_duration || ' minutes')::interval)::time;
    IF v_cnt > v_best_count THEN
      v_best_count := v_cnt;
      v_best_start := c;
      v_best_ids   := v_ids[1 : LEAST(v_cnt, v_max_group)];
    END IF;
  END LOOP;

  IF v_best_start IS NULL THEN
    RETURN;
  END IF;

  -- Реальное валидное окно для ВЫБРАННОЙ группы (не всех кандидатов):
  -- самый поздний "готов с" и самый ранний "готов до" среди победивших заявок,
  -- обрезанные рабочими часами мастера.
  SELECT max(preferred_start), min(preferred_end) INTO v_win_lo, v_win_hi
    FROM public.bookings WHERE id = ANY(v_best_ids);

  proposed_start      := v_best_start;
  proposed_end        := (v_best_start + (v_duration || ' minutes')::interval)::time;
  matched_booking_ids := v_best_ids;
  matched_count       := array_length(v_best_ids, 1);
  window_start        := GREATEST(v_win_lo, v_work_start);
  window_end          := (LEAST(v_win_hi, v_work_end) - (v_duration || ' minutes')::interval)::time;
  duration_minutes    := v_duration;
  RETURN NEXT;
END;
$$;

-- Фикс 2: нельзя было отменить ещё не подтверждённую (pending_approval)
-- заявку на групповую тренировку — CHECK bookings_slot_required_unless_pending
-- требовал slot_start/slot_end для ЛЮБОГО статуса, кроме pending_approval,
-- включая cancelled. У заявки, которую отменяют ДО подтверждения слота
-- тренером, slot_start/slot_end ещё не назначены — PATCH падал с 23514.
-- Отменённой записи слот не нужен, поэтому статус cancelled тоже
-- освобождаем от этого требования.
ALTER TABLE public.bookings DROP CONSTRAINT bookings_slot_required_unless_pending;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_slot_required_unless_pending
  CHECK (status IN ('pending_approval', 'cancelled') OR (slot_start IS NOT NULL AND slot_end IS NOT NULL));
