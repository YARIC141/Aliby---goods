-- По просьбе владельца: клиенту, выбирающему день для персональной
-- тренировки "с донабором" (max_group_size > 1), нужно видеть время и
-- количество уже существующих заявок/подтверждённых сессий на этот день —
-- чтобы можно было выбрать существующий слот и попасть в общую группу
-- (через уже существующий auto-join триггер personal_training_auto_join,
-- если это подтверждённая сессия) либо указать свой диапазон.
-- Раньше это скрывалось полностью (personal_training_group_dates отдаёт
-- только даты, без времени и количества) — эта функция даёт детализацию
-- на уровне одного выбранного дня, без утечки личных данных (имя/телефон
-- не возвращаются, только время и число заявок).
CREATE OR REPLACE FUNCTION public.personal_training_day_options(
  p_master_id    UUID,
  p_menu_item_id UUID,
  p_date         DATE
)
RETURNS TABLE (
  slot_start TIME,
  slot_end   TIME,
  taken      INTEGER,
  max_group  INTEGER,
  kind       TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Уже подтверждённые сессии этого мастера на этот день, в которых ещё
  -- есть свободное место (кроме заявок самого клиента — ему незачем
  -- "присоединяться" к тому, где он уже участвует).
  SELECT b.slot_start, b.slot_end, count(*)::int AS taken, mi.max_group_size AS max_group, 'confirmed'::text AS kind
    FROM public.bookings b
    JOIN public.menu_items mi ON mi.id = b.menu_item_id
    WHERE b.master_id = p_master_id AND b.menu_item_id = p_menu_item_id
      AND b.slot_date = p_date AND b.status = 'booked'
      AND auth.uid() IS NOT NULL AND b.user_id <> auth.uid()
    GROUP BY b.slot_start, b.slot_end, mi.max_group_size
    HAVING count(*) < COALESCE(mi.max_group_size, 1)
  UNION ALL
  -- Ещё не подтверждённые заявки других клиентов на этот день, сгруппированные
  -- по одинаковому желаемому диапазону.
  SELECT b.preferred_start, b.preferred_end, count(*)::int AS taken, mi.max_group_size AS max_group, 'pending'::text AS kind
    FROM public.bookings b
    JOIN public.menu_items mi ON mi.id = b.menu_item_id
    WHERE b.master_id = p_master_id AND b.menu_item_id = p_menu_item_id
      AND b.slot_date = p_date AND b.status = 'pending_approval'
      AND auth.uid() IS NOT NULL AND b.user_id <> auth.uid()
    GROUP BY b.preferred_start, b.preferred_end, mi.max_group_size
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_day_options(UUID, UUID, DATE) TO authenticated;
