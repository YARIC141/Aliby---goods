-- Тренер сам выбирает итоговое время внутри пересекающегося интервала группы
-- персональных тренировок (вместо слепого автоподбора), с разбивкой цены на
-- участников и уведомлениями при подтверждении/пересчёте.
--
-- Три части:
--   1) personal_training_match_proposal — дополняем результатом валидного
--      окна [window_start, window_end] (window_end — это ПОСЛЕДНИЙ допустимый
--      старт, не конец занятия), внутри которого тренер может выбрать точное
--      время; сам слот обязан иметь длительность duration_minutes позиции.
--   2) admin_notifications — лёгкая таблица + realtime-канал для уведомления
--      продавца/тренера о пересчёте цены группы (push для админки не заведён,
--      как и для мастеров вообще — они всегда работают через веб-кабинет).
--   3) personal_training_confirm_slot — новый RPC вместо голого PATCH из
--      admin/index.html: проверяет выбранное время, переводит заявки в
--      'booked' и запускает пересчёт/уведомления через
--      personal_training_recalc_group (используется также автодонабором,
--      ручным добавлением и отменой участника — везде, где меняется состав
--      уже подтверждённой группы).

-- ── 1. Окно допустимого времени в предложении ────────────────────────────────
DROP FUNCTION IF EXISTS public.personal_training_match_proposal(UUID, UUID, DATE);

CREATE OR REPLACE FUNCTION public.personal_training_match_proposal(
  p_master_id    UUID,
  p_menu_item_id UUID,
  p_date         DATE
)
RETURNS TABLE (
  proposed_start      TIME,
  proposed_end        TIME,
  matched_booking_ids UUID[],
  matched_count       INTEGER,
  window_start        TIME,
  window_end          TIME,
  duration_minutes    INTEGER
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

  SELECT duration_minutes, max_group_size INTO v_duration, v_max_group
    FROM public.menu_items WHERE id = p_menu_item_id;
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

GRANT EXECUTE ON FUNCTION public.personal_training_match_proposal(UUID, UUID, DATE) TO authenticated;

-- ── 2. Уведомление продавца/тренера без push-канала ──────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_store ON public.admin_notifications (store_id, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_notifications: owner/employee read" ON public.admin_notifications;
CREATE POLICY "admin_notifications: owner/employee read"
  ON public.admin_notifications FOR SELECT
  USING (public.is_platform_owner() OR public.is_store_owner_of(store_id) OR public.is_employee_of(store_id));

GRANT SELECT ON public.admin_notifications TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

CREATE OR REPLACE FUNCTION public.personal_training_notify_admin(p_store_id UUID, p_message TEXT)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.admin_notifications (store_id, message) VALUES (p_store_id, p_message);
$$;

-- ── 3. Базовая цена услуги (то же правило, что в set_booking_price) ──────────
CREATE OR REPLACE FUNCTION public.compute_service_base_price(p_master_id UUID, p_menu_item_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_price NUMERIC;
BEGIN
  IF p_master_id IS NOT NULL THEN
    SELECT price INTO v_price
      FROM public.master_services
      WHERE master_id = p_master_id AND service_id = p_menu_item_id
      LIMIT 1;
  END IF;
  IF v_price IS NULL THEN
    SELECT price INTO v_price FROM public.menu_items WHERE id = p_menu_item_id;
  END IF;
  RETURN COALESCE(v_price, 0);
END;
$$;

-- ── 4. Обёртка над отправкой push (та же схема, что и в notify_booking_push) ─
CREATE OR REPLACE FUNCTION public.personal_training_send_push(p_user_id UUID, p_type TEXT, p_data JSONB)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://alliby.ru/functions/v1/send-push',
    body    := jsonb_build_object('user_id', p_user_id, 'type', p_type, 'data', p_data),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-push-secret', 'Zw8hHn4mv3ee1XzbX12H7EutpMv2lLyo'
               )
  );
END;
$$;

-- ── 5. Пересчёт цены группы + уведомления ────────────────────────────────────
-- Вызывается везде, где меняется состав уже подтверждённой сессии:
-- personal_training_confirm_slot (первое подтверждение), personal_training_
-- auto_join/add_to_group (донабор), отмена участника (см. триггер ниже).
--
--   p_confirm_all    — true только при первом подтверждении тренером: ВСЕ
--                       участники получают "training_group_confirmed" вне
--                       зависимости от того, поменялась ли цена численно;
--   p_new_booking_id — при донаборе: именно эта заявка получает "confirmed"
--                       (для неё это первое уведомление о цене), остальные —
--                       "price_changed", только если их цена реально изменилась;
--   p_notify_admin   — уведомлять ли продавца/тренера (false для первого
--                       подтверждения — это его собственное действие).
CREATE OR REPLACE FUNCTION public.personal_training_recalc_group(
  p_menu_item_id   UUID,
  p_slot_date      DATE,
  p_slot_start     TIME,
  p_slot_end       TIME,
  p_confirm_all    BOOLEAN DEFAULT false,
  p_new_booking_id UUID    DEFAULT NULL,
  p_notify_admin   BOOLEAN DEFAULT true
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r           RECORD;
  v_count     INTEGER;
  v_master_id UUID;
  v_store_id  UUID;
  v_base      NUMERIC;
  v_price     NUMERIC;
  v_item_name TEXT;
  v_time_from TEXT := to_char(p_slot_start, 'HH24:MI');
  v_time_to   TEXT := to_char(p_slot_end,   'HH24:MI');
BEGIN
  SELECT count(*), max(master_id), max(store_id) INTO v_count, v_master_id, v_store_id
    FROM public.bookings
    WHERE menu_item_id = p_menu_item_id AND slot_date = p_slot_date
      AND slot_start = p_slot_start AND status = 'booked';

  SELECT name INTO v_item_name FROM public.menu_items WHERE id = p_menu_item_id;

  IF v_count = 0 THEN
    IF p_notify_admin AND v_store_id IS NOT NULL THEN
      PERFORM public.personal_training_notify_admin(v_store_id,
        format('«%s» %s %s — группа распалась, все участники отменились',
               v_item_name, to_char(p_slot_date,'DD.MM'), v_time_from));
    END IF;
    RETURN;
  END IF;

  v_base  := public.compute_service_base_price(v_master_id, p_menu_item_id);
  v_price := round(v_base / v_count);

  FOR r IN
    SELECT id, user_id, total_price FROM public.bookings
    WHERE menu_item_id = p_menu_item_id AND slot_date = p_slot_date
      AND slot_start = p_slot_start AND status = 'booked'
  LOOP
    IF r.total_price IS DISTINCT FROM v_price THEN
      UPDATE public.bookings SET total_price = v_price WHERE id = r.id;
    END IF;

    IF p_confirm_all OR r.id = p_new_booking_id THEN
      PERFORM public.personal_training_send_push(r.user_id, 'training_group_confirmed',
        jsonb_build_object('price', v_price, 'time_from', v_time_from, 'time_to', v_time_to,
                            'item_name', v_item_name, 'booking_id', r.id));
    ELSIF r.total_price IS DISTINCT FROM v_price THEN
      PERFORM public.personal_training_send_push(r.user_id, 'training_price_changed',
        jsonb_build_object('price', v_price, 'time_from', v_time_from, 'time_to', v_time_to,
                            'item_name', v_item_name, 'booking_id', r.id));
    END IF;
  END LOOP;

  IF p_notify_admin AND v_store_id IS NOT NULL THEN
    PERFORM public.personal_training_notify_admin(v_store_id,
      format('«%s» %s %s–%s: состав группы изменился, новая цена %s ₽/чел (участников: %s)',
             v_item_name, to_char(p_slot_date,'DD.MM'), v_time_from, v_time_to, v_price, v_count));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_recalc_group(UUID,DATE,TIME,TIME,BOOLEAN,UUID,BOOLEAN) TO authenticated;

-- ── 6. RPC подтверждения выбранного тренером слота ───────────────────────────
CREATE OR REPLACE FUNCTION public.personal_training_confirm_slot(
  p_master_id    UUID,
  p_menu_item_id UUID,
  p_date         DATE,
  p_start_time   TIME,
  p_booking_ids  UUID[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duration   INTEGER;
  v_dow        SMALLINT;
  v_work_start TIME;
  v_work_end   TIME;
  v_end_time   TIME;
  v_bad_count  INTEGER;
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

  IF p_booking_ids IS NULL OR array_length(p_booking_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Не выбраны заявки для подтверждения' USING ERRCODE = '22023';
  END IF;

  SELECT duration_minutes INTO v_duration FROM public.menu_items WHERE id = p_menu_item_id;
  IF v_duration IS NULL THEN v_duration := 60; END IF;
  v_end_time := (p_start_time + (v_duration || ' minutes')::interval)::time;

  v_dow := (EXTRACT(ISODOW FROM p_date)::INTEGER - 1);
  SELECT start_time, end_time INTO v_work_start, v_work_end
    FROM public.master_schedules WHERE master_id = p_master_id AND day_of_week = v_dow;
  IF v_work_start IS NULL OR p_start_time < v_work_start OR v_end_time > v_work_end THEN
    RAISE EXCEPTION 'Выбранное время вне рабочего графика тренера' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_bad_count
    FROM public.bookings
    WHERE id = ANY(p_booking_ids)
      AND (status <> 'pending_approval'
        OR master_id <> p_master_id
        OR menu_item_id <> p_menu_item_id
        OR slot_date <> p_date
        OR preferred_start > p_start_time
        OR preferred_end   < v_end_time);
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'Выбранное время не покрывается диапазоном одного из участников' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings
    SET status = 'booked', slot_start = p_start_time, slot_end = v_end_time
    WHERE id = ANY(p_booking_ids);

  PERFORM public.personal_training_recalc_group(p_menu_item_id, p_date, p_start_time, v_end_time, true, NULL, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_confirm_slot(UUID,UUID,DATE,TIME,UUID[]) TO authenticated;

-- ── 7. Донабор группы теперь тоже пересчитывает цену и уведомляет ───────────
CREATE OR REPLACE FUNCTION public.personal_training_add_to_group(p_booking_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_booking   public.bookings%ROWTYPE;
  v_max_group INTEGER;
  v_slot      RECORD;
  v_taken     INTEGER;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Заявка не найдена' USING ERRCODE = 'P0002';
  END IF;
  IF v_booking.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Заявка уже обработана' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    v_booking.master_id = auth.uid()
    OR public.is_platform_owner()
    OR public.is_store_owner_of(v_booking.store_id)
    OR public.is_employee_of(v_booking.store_id)
  ) THEN
    RAISE EXCEPTION 'Недостаточно прав' USING ERRCODE = '42501';
  END IF;

  SELECT slot_start, slot_end INTO v_slot
    FROM public.bookings
    WHERE menu_item_id = v_booking.menu_item_id
      AND master_id    = v_booking.master_id
      AND slot_date     = v_booking.slot_date
      AND status = 'booked'
      AND slot_start >= v_booking.preferred_start
      AND slot_end   <= v_booking.preferred_end
    LIMIT 1;

  IF v_slot.slot_start IS NULL THEN
    RAISE EXCEPTION 'Нет подтверждённой сессии, подходящей по времени заявки' USING ERRCODE = '22023';
  END IF;

  SELECT max_group_size INTO v_max_group FROM public.menu_items WHERE id = v_booking.menu_item_id;
  SELECT count(*) INTO v_taken
    FROM public.bookings
    WHERE menu_item_id = v_booking.menu_item_id
      AND slot_date    = v_booking.slot_date
      AND slot_start   = v_slot.slot_start
      AND status = 'booked';

  IF v_taken >= COALESCE(v_max_group, 1) THEN
    RAISE EXCEPTION 'Группа уже набрана' USING ERRCODE = '23514';
  END IF;

  UPDATE public.bookings
    SET status = 'booked', slot_start = v_slot.slot_start, slot_end = v_slot.slot_end
    WHERE id = p_booking_id;

  PERFORM public.personal_training_recalc_group(
    v_booking.menu_item_id, v_booking.slot_date, v_slot.slot_start, v_slot.slot_end,
    false, p_booking_id, true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_add_to_group(UUID) TO authenticated;

-- ── 8. Автодонабор тоже пересчитывает цену и уведомляет ──────────────────────
-- booking_aa_auto_join_group (BEFORE INSERT) только выставляет статус/слот —
-- саму строку ещё не видно другим запросам до завершения INSERT. Пересчёт и
-- уведомления делаем отдельным AFTER INSERT триггером, когда группа (включая
-- новую строку) уже видна.
CREATE OR REPLACE FUNCTION public.personal_training_notify_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'booked' AND EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE id = NEW.menu_item_id AND is_training AND training_mode = 'personal'
  ) THEN
    PERFORM public.personal_training_recalc_group(
      NEW.menu_item_id, NEW.slot_date, NEW.slot_start, NEW.slot_end, false, NEW.id, true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_zz_training_notify_after_insert ON public.bookings;
CREATE TRIGGER booking_zz_training_notify_after_insert
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.personal_training_notify_after_insert();

-- ── 9. Отмена участника подтверждённой группы пересчитывает цену ────────────
-- Срабатывает независимо от того, откуда пришла отмена (админка/клиент) —
-- cancelBooking() и любой другой путь просто меняют status на 'cancelled',
-- slot_start/slot_end/menu_item_id при этом не трогаются.
CREATE OR REPLACE FUNCTION public.personal_training_notify_after_cancel()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'booked' AND NEW.status = 'cancelled' AND EXISTS (
    SELECT 1 FROM public.menu_items
    WHERE id = NEW.menu_item_id AND is_training AND training_mode = 'personal'
  ) THEN
    PERFORM public.personal_training_recalc_group(
      NEW.menu_item_id, NEW.slot_date, OLD.slot_start, OLD.slot_end, false, NULL, true
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_zz_training_notify_after_cancel ON public.bookings;
CREATE TRIGGER booking_zz_training_notify_after_cancel
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.personal_training_notify_after_cancel();
