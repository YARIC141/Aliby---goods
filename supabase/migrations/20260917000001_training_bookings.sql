-- Migration: групповые/персональные тренировки (направления sport/entertainment)
--
-- Товар с item_type='service' может быть помечен как «Тренировка» (is_training).
-- У такой позиции — режим (training_mode): 'group' (идёт по своему недельному
-- расписанию training_schedules, вместимость слота = max_group_size) или
-- 'personal' (клиент указывает диапазон времени, в который готов заниматься;
-- заявки с пересекающимися диапазонами тренер объединяет в одну сессию, до
-- max_group_size человек).
--
-- bookings получает новый статус 'pending_approval' — заявка на персональную
-- тренировку висит в нём, пока тренер не зафиксирует финальное время (после
-- этого запись обычным порядком переходит в 'booked', как и любая другая).
-- Пока запись 'pending_approval', она НЕ занимает время тренера — это только
-- предпочтение клиента, а не бронь слота.

-- ── 1. menu_items: признак тренировки и её параметры ─────────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_training    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS training_mode  TEXT CHECK (training_mode IN ('group','personal')),
  ADD COLUMN IF NOT EXISTS max_group_size INTEGER CHECK (max_group_size > 0);

ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_training_service_only;
ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_training_service_only
  CHECK (NOT is_training OR item_type = 'service');

ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_training_consistency;
ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_training_consistency
  CHECK (
    (is_training AND training_mode IS NOT NULL AND max_group_size IS NOT NULL)
    OR
    (NOT is_training AND training_mode IS NULL AND max_group_size IS NULL)
  );

-- ── 2. training_schedules: недельное расписание группового занятия ──────────
-- Аналог master_schedules, но привязан к позиции-товару, а не к тренеру — у
-- каждого выбранного дня недели своё время начала (день+время, не общее на все).
CREATE TABLE IF NOT EXISTS public.training_schedules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID        NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  day_of_week  SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Пн..6=Вс, как master_schedules
  start_time   TIME        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_training_schedules_item ON public.training_schedules (menu_item_id);

ALTER TABLE public.training_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "training_schedules: public read"
  ON public.training_schedules FOR SELECT USING (true);

CREATE POLICY "training_schedules: owner insert"
  ON public.training_schedules FOR INSERT
  WITH CHECK (
    public.is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = training_schedules.menu_item_id
        AND public.is_store_owner_of(mi.store_id)
    )
  );

CREATE POLICY "training_schedules: owner update"
  ON public.training_schedules FOR UPDATE
  USING (
    public.is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = training_schedules.menu_item_id
        AND public.is_store_owner_of(mi.store_id)
    )
  );

CREATE POLICY "training_schedules: owner delete"
  ON public.training_schedules FOR DELETE
  USING (
    public.is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.menu_items mi
      WHERE mi.id = training_schedules.menu_item_id
        AND public.is_store_owner_of(mi.store_id)
    )
  );

-- ── 3. bookings: статус pending_approval + диапазон предпочтения ────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS preferred_start TIME,
  ADD COLUMN IF NOT EXISTS preferred_end   TIME;

ALTER TABLE public.bookings ALTER COLUMN slot_start DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN slot_end   DROP NOT NULL;

-- Заодно чиним существующий баг: кнопка «Завершить» (completeBooking() в
-- admin/index.html) ставит статус 'completed', которого не было в старом
-- CHECK ('booked','cancelled','rescheduled') — запрос падал с ошибкой 23514.
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending_approval','booked','completed','cancelled','rescheduled'));

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_slot_required_unless_pending;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_slot_required_unless_pending
  CHECK (status = 'pending_approval' OR (slot_start IS NOT NULL AND slot_end IS NOT NULL));

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_pending_requires_preference;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_pending_requires_preference
  CHECK (status <> 'pending_approval' OR (preferred_start IS NOT NULL AND preferred_end IS NOT NULL AND preferred_end > preferred_start));

-- ── 4. Overlap/вместимость слота — переписанный триггер ─────────────────────
-- pending_approval ничего не занимает (пропускаем целиком). Для 'booked':
-- сначала проверяем вместимость ТОЧНО этого слота (та же позиция+дата+время
-- начала) — там, где is_training, вместимость = max_group_size, иначе как и
-- раньше 1 место. Затем — обычная проверка пересечения календаря тренера/
-- заведения с ЧУЖИМИ слотами (кроме как раз этого общего слота, который уже
-- разобран выше).
CREATE OR REPLACE FUNCTION public.booking_overlap_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_lock_key        TEXT;
  v_conflict        BOOLEAN;
  v_is_training     BOOLEAN;
  v_max_group_size  INTEGER;
  v_capacity        INTEGER;
  v_same_slot_count INTEGER;
BEGIN
  IF NEW.status <> 'booked' THEN
    RETURN NEW;
  END IF;

  v_lock_key := COALESCE(NEW.master_id::text, 'store:' || NEW.store_id::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  SELECT is_training, max_group_size INTO v_is_training, v_max_group_size
    FROM public.menu_items WHERE id = NEW.menu_item_id;
  v_capacity := CASE WHEN v_is_training THEN COALESCE(v_max_group_size, 1) ELSE 1 END;

  SELECT count(*) INTO v_same_slot_count
    FROM public.bookings b
    WHERE b.menu_item_id = NEW.menu_item_id
      AND b.slot_date    = NEW.slot_date
      AND b.slot_start   = NEW.slot_start
      AND b.status = 'booked'
      AND b.id <> NEW.id;

  IF v_same_slot_count >= v_capacity THEN
    IF v_capacity > 1 THEN
      RAISE EXCEPTION 'Группа уже набрана, выберите другое время' USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION 'Это время уже занято, выберите другой слот' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.master_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.master_id = NEW.master_id
        AND b.id <> NEW.id
        AND b.slot_date = NEW.slot_date
        AND b.status = 'booked'
        AND b.slot_start < NEW.slot_end
        AND b.slot_end   > NEW.slot_start
        AND NOT (b.menu_item_id = NEW.menu_item_id AND b.slot_start = NEW.slot_start)
    ) INTO v_conflict;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.store_id = NEW.store_id
        AND b.master_id IS NULL
        AND b.id <> NEW.id
        AND b.slot_date = NEW.slot_date
        AND b.status = 'booked'
        AND b.slot_start < NEW.slot_end
        AND b.slot_end   > NEW.slot_start
        AND NOT (b.menu_item_id = NEW.menu_item_id AND b.slot_start = NEW.slot_start)
    ) INTO v_conflict;
  END IF;

  IF v_conflict THEN
    RAISE EXCEPTION 'Это время уже занято, выберите другой слот' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 5. Автоматический подбор группы для персональных тренировок ─────────────
-- Кандидаты старта сессии — это самые «плотные» точки: начало чьего-то
-- диапазона готовности или (конец диапазона − длительность). Для каждого
-- кандидата считаем, сколько pending_approval заявок целиком покрывают
-- сессию нужной длины начиная с этой точки, и берём кандидата с максимумом
-- (при равенстве — самый ранний по времени). Итог ограничивается
-- max_group_size позиции; при переполнении в группу берутся заявки по
-- порядку подачи (created_at).
CREATE OR REPLACE FUNCTION public.personal_training_match_proposal(
  p_master_id    UUID,
  p_menu_item_id UUID,
  p_date         DATE
)
RETURNS TABLE (
  proposed_start      TIME,
  proposed_end        TIME,
  matched_booking_ids UUID[],
  matched_count       INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  SELECT duration_minutes, max_group_size INTO v_duration, v_max_group
    FROM public.menu_items WHERE id = p_menu_item_id;
  IF v_duration IS NULL THEN v_duration := 60; END IF;
  IF v_max_group IS NULL THEN v_max_group := 1; END IF;

  -- day_of_week конвенция проекта: 0=Пн..6=Вс (см. master_schedules), а не
  -- Postgres EXTRACT(DOW) где 0=Вс — берём ISODOW (1=Пн..7=Вс) и сдвигаем.
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

  proposed_start      := v_best_start;
  proposed_end        := (v_best_start + (v_duration || ' minutes')::interval)::time;
  matched_booking_ids := v_best_ids;
  matched_count       := array_length(v_best_ids, 1);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_match_proposal(UUID, UUID, DATE) TO authenticated;
