-- По просьбе владельца: клиент должен видеть разницу между датой, где на
-- тренировку только собираются желающие (заявки на утверждении), и датой,
-- где группа уже ПОДТВЕРЖДЕНА тренером и есть место — во втором случае
-- присоединение происходит мгновенно через уже существующий триггер
-- personal_training_auto_join. Раньше personal_training_group_dates отдавал
-- только список дат без этого различия — теперь дополнительно возвращаем
-- признак has_confirmed на каждую дату, чтобы точка в календаре могла быть
-- жёлтой (подтверждено тренером) вместо обычной (есть заявки на утверждении).
DROP FUNCTION IF EXISTS public.personal_training_group_dates(UUID, UUID, DATE, DATE);

CREATE FUNCTION public.personal_training_group_dates(
  p_master_id    UUID,
  p_menu_item_id UUID,
  p_date_from    DATE,
  p_date_to      DATE
)
RETURNS TABLE (slot_date DATE, has_confirmed BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.slot_date,
    bool_or(
      b.status = 'booked'
      AND (
        SELECT count(*) FROM public.bookings b2
        WHERE b2.menu_item_id = b.menu_item_id
          AND b2.slot_date    = b.slot_date
          AND b2.slot_start   = b.slot_start
          AND b2.status = 'booked'
      ) < COALESCE(mi.max_group_size, 1)
    ) AS has_confirmed
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
    )
  GROUP BY b.slot_date;
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_group_dates(UUID, UUID, DATE, DATE) TO authenticated;
