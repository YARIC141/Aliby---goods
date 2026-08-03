-- Расписание заведения тэсто на месяц вперёд
-- 09:00–20:00, все дни с сегодня по сегодня+30
SET ROLE supabase_admin;

DO $$
DECLARE
  v_store_id UUID;
  v_date DATE;
  v_end DATE;
BEGIN
  SELECT id INTO v_store_id FROM public.stores WHERE name ILIKE '%тэсто%' LIMIT 1;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Store тэсто not found';
  END IF;

  v_date := CURRENT_DATE;
  v_end  := CURRENT_DATE + INTERVAL '30 days';

  WHILE v_date <= v_end LOOP
    INSERT INTO public.store_schedules (store_id, date, slots)
    VALUES (
      v_store_id,
      v_date,
      '[{"start":"09:00","end":"20:00"}]'::jsonb
    )
    ON CONFLICT (store_id, date) DO NOTHING;
    v_date := v_date + INTERVAL '1 day';
  END LOOP;

  RAISE NOTICE 'Done: created schedule for store % from % to %', v_store_id, CURRENT_DATE, v_end;
END $$;

RESET ROLE;
