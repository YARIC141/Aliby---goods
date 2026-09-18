-- Донабор группы для персональных тренировок «на несколько человек» +
-- приватный сигнал «уже есть желающие» для другого клиента.
--
-- Решение опирается на уже существующий механизм (bookings.preferred_start/
-- preferred_end хранит исходный интервал каждого клиента независимо от
-- финального slot_start/slot_end; personal_training_match_proposal уже
-- объединяет пересекающиеся заявки в одну сессию по общему slot_start) —
-- отдельная таблица training_sessions не нужна, "сессия" — это просто
-- набор bookings с одинаковыми (menu_item_id, slot_date, slot_start).
--
-- Добавляем то, чего не было:
--   1) автодобавление новой заявки к УЖЕ подтверждённой группе, если её
--      диапазон готовности целиком покрывает подтверждённое время сессии
--      (без повторного подтверждения тренером);
--   2) RPC для тренера/владельца — вручную добавить оставшуюся pending-
--      заявку к уже подтверждённой сессии;
--   3) приватный RPC-сигнал для клиента: есть ли на эту тренировку у этого
--      мастера уже желающие в диапазоне дат (без деталей — сколько и когда
--      именно).

-- ── 1. Автодобавление новой заявки к уже подтверждённой сессии ──────────────
CREATE OR REPLACE FUNCTION public.personal_training_auto_join()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_is_training BOOLEAN;
  v_mode        TEXT;
  v_max_group   INTEGER;
  v_slot        RECORD;
  v_taken       INTEGER;
BEGIN
  IF NEW.status <> 'pending_approval' THEN
    RETURN NEW;
  END IF;

  SELECT is_training, training_mode, max_group_size INTO v_is_training, v_mode, v_max_group
    FROM public.menu_items WHERE id = NEW.menu_item_id;

  IF NOT COALESCE(v_is_training, false) OR v_mode IS DISTINCT FROM 'personal' THEN
    RETURN NEW;
  END IF;

  SELECT slot_start, slot_end INTO v_slot
    FROM public.bookings
    WHERE menu_item_id = NEW.menu_item_id
      AND master_id    = NEW.master_id
      AND slot_date     = NEW.slot_date
      AND status = 'booked'
      AND slot_start >= NEW.preferred_start
      AND slot_end   <= NEW.preferred_end
    LIMIT 1;

  IF v_slot.slot_start IS NULL THEN
    RETURN NEW; -- подходящей подтверждённой сессии нет — обычная заявка на утверждение
  END IF;

  SELECT count(*) INTO v_taken
    FROM public.bookings
    WHERE menu_item_id = NEW.menu_item_id
      AND slot_date    = NEW.slot_date
      AND slot_start   = v_slot.slot_start
      AND status = 'booked';

  IF v_taken >= COALESCE(v_max_group, 1) THEN
    RETURN NEW; -- группа уже набрана — оставляем заявку тренеру как обычно
  END IF;

  NEW.status     := 'booked';
  NEW.slot_start := v_slot.slot_start;
  NEW.slot_end   := v_slot.slot_end;
  -- preferred_start/preferred_end НЕ трогаем — это исходный интервал клиента,
  -- он должен остаться, даже когда финальное время уже определено.
  RETURN NEW;
END;
$$;

-- Имя триггера начинается на "booking_aa_" — должен сработать РАНЬШЕ
-- booking_overlap_check (алфавитный порядок BEFORE-триггеров в Postgres),
-- чтобы проверка вместимости/пересечений увидела уже выставленный статус
-- 'booked' и правильный слот.
DROP TRIGGER IF EXISTS booking_aa_auto_join_group ON public.bookings;
CREATE TRIGGER booking_aa_auto_join_group
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.personal_training_auto_join();

-- ── 2. Ручное добавление оставшейся заявки к уже подтверждённой сессии ──────
-- Для случая, когда pending-заявка существовала ДО подтверждения группы, но
-- не попала в неё (например, ограничение max_group_size) — тренер/владелец
-- добавляет её вручную кнопкой в админке, когда в группе освободилось место.
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_add_to_group(UUID) TO authenticated;

-- ── 3. Приватный сигнал «уже есть желающие» для календаря другого клиента ──
-- Не возвращает ни точное время, ни количество, ни кто именно — только даты
-- в запрошенном диапазоне, где по этой тренировке у этого мастера уже есть
-- ЧУЖАЯ (не текущего пользователя) заявка/подтверждённая группа с местом.
CREATE OR REPLACE FUNCTION public.personal_training_group_dates(
  p_master_id    UUID,
  p_menu_item_id UUID,
  p_date_from    DATE,
  p_date_to      DATE
)
RETURNS DATE[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT b.slot_date), '{}')
  FROM public.bookings b
  JOIN public.menu_items mi ON mi.id = b.menu_item_id
  WHERE b.master_id    = p_master_id
    AND b.menu_item_id = p_menu_item_id
    AND b.slot_date BETWEEN p_date_from AND p_date_to
    AND b.status IN ('pending_approval', 'booked')
    AND auth.uid() IS NOT NULL
    AND b.user_id <> auth.uid()
    AND (
      b.status = 'pending_approval'
      OR (
        SELECT count(*) FROM public.bookings b2
        WHERE b2.menu_item_id = b.menu_item_id
          AND b2.slot_date    = b.slot_date
          AND b2.slot_start   = b.slot_start
          AND b2.status = 'booked'
      ) < COALESCE(mi.max_group_size, 1)
    );
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_group_dates(UUID, UUID, DATE, DATE) TO authenticated;
