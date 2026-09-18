-- Фикс: personal_training_confirm_slot (и любой другой путь, вызывающий
-- personal_training_recalc_group — донабор, автодонабор, отмена участника)
-- падал с 42883 "function max(uuid) does not exist". В PostgreSQL нет
-- встроенного агрегата max()/min() для типа uuid (есть только операторы
-- сравнения). Строка "max(master_id), max(store_id)" в recalc_group как раз
-- и вызывала этот агрегат на uuid-колонках. Все записи в группе всегда имеют
-- одинаковый master_id/store_id, поэтому для получения "любого" значения
-- достаточно агрегата по тексту с обратным приведением типа.
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
  SELECT count(*), max(master_id::text)::uuid, max(store_id::text)::uuid
    INTO v_count, v_master_id, v_store_id
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
