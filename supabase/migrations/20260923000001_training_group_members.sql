-- По просьбе владельца: при нажатии на подтверждённую групповую тренировку
-- клиент должен видеть, сколько человек в группе и их имена (по аналогии с
-- тем, что администратор уже видит в панели). Раньше это никак не отдавалось
-- клиенту — только количество и время были видны администратору.
--
-- В отличие от personal_training_day_options (которая намеренно скрывает
-- имена для ещё не сформированных/чужих групп), здесь клиент уже сам
-- является ПОДТВЕРЖДЁННЫМ участником именно этой группы — поэтому его
-- сотренирующихся можно показать по имени, это не утечка чужих данных
-- посторонним, а список видимых друг другу участников одной тренировки.
CREATE OR REPLACE FUNCTION public.personal_training_group_members(
  p_booking_id UUID
)
RETURNS TABLE (
  user_id   UUID,
  full_name TEXT,
  is_me     BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b2.user_id, COALESCE(pr.full_name, 'Клиент') AS full_name, (b2.user_id = auth.uid()) AS is_me
  FROM public.bookings b1
  JOIN public.bookings b2
    ON b2.master_id    = b1.master_id
   AND b2.menu_item_id = b1.menu_item_id
   AND b2.slot_date    = b1.slot_date
   AND b2.slot_start   = b1.slot_start
   AND b2.status = 'booked'
  LEFT JOIN public.profiles pr ON pr.id = b2.user_id
  WHERE b1.id = p_booking_id
    AND b1.user_id = auth.uid()
    AND b1.status = 'booked'
  ORDER BY is_me DESC, full_name;
$$;

GRANT EXECUTE ON FUNCTION public.personal_training_group_members(UUID) TO authenticated;
