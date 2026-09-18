-- Один клиент не должен иметь две заявки на одну и ту же персональную
-- тренировку (тот же menu_item_id) в один день с пересекающимися диапазонами
-- готовности (preferred_start/preferred_end) — до сих пор это ничем не
-- проверялось: booking_overlap_check пропускает всё, что не status='booked',
-- а pending_approval заявки как раз всегда начинаются с этого статуса.
--
-- Разрешено подавать НЕСКОЛЬКО заявок на один день (например, "утро" и
-- "вечер" отдельно), но их диапазоны не должны пересекаться друг с другом.
-- Проверяем и против чужих же pending_approval, и против уже подтверждённой
-- (booked) сессии этого клиента — preferred_start/preferred_end у booked
-- строки сохраняется навсегда (см. personal_training_auto_join).

CREATE OR REPLACE FUNCTION public.personal_training_no_self_overlap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_conflict BOOLEAN;
BEGIN
  IF NEW.preferred_start IS NULL OR NEW.preferred_end IS NULL THEN
    RETURN NEW; -- не персональная тренировка с диапазоном готовности
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.user_id      = NEW.user_id
      AND b.menu_item_id = NEW.menu_item_id
      AND b.slot_date    = NEW.slot_date
      AND b.status IN ('pending_approval', 'booked')
      AND b.id <> NEW.id
      AND b.preferred_start IS NOT NULL
      AND b.preferred_end   IS NOT NULL
      AND b.preferred_start < NEW.preferred_end
      AND b.preferred_end   > NEW.preferred_start
  ) INTO v_conflict;

  IF v_conflict THEN
    RAISE EXCEPTION 'У вас уже есть заявка на это занятие в этот день с пересекающимся временем — выберите диапазон вне уже указанного' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Имя начинается на "a0" — раньше booking_aa_auto_join_group по алфавиту,
-- проверяем диапазон ДО того, как авто-донабор что-то поменяет в строке
-- (хотя preferred_start/preferred_end он и так не трогает).
DROP TRIGGER IF EXISTS booking_a0_no_self_overlap ON public.bookings;
CREATE TRIGGER booking_a0_no_self_overlap
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.personal_training_no_self_overlap();
