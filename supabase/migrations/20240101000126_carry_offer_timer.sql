-- ============================================================
-- Alliby Carry: таймер на предложение заказа курьеру (30 сек)
-- ============================================================
-- Раньше курьер видел предложенный заказ (carry_dispatch_status='assigned')
-- без явного «Принять» и без ограничения по времени — можно было держать
-- заказ бесконечно, ничего не нажимая, кроме «Отказаться». Теперь:
--   - у предложения есть срок (carry_offer_expires_at, назначается на
--     +30 секунд при каждом новом назначении);
--   - явный отказ («Отказаться») исключает курьера от ЭТОГО заказа
--     НАВСЕГДА (carry_declined_courier_ids) — по решению пользователя,
--     сознательно отличается от общего принципа
--     20240101000100_courier_decline_not_permanent.sql, который здесь
--     сохраняется только для случая таймаута;
--   - таймаут (courier_timeout_order, либо резервный cron
--     expire_stale_courier_offers) НЕ исключает курьера навсегда — он
--     просто попадает в carry_offered_courier_ids и может быть предложен
--     этому же заказу повторно, если больше некому.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carry_offer_expires_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS carry_declined_courier_ids  UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS carry_offered_courier_ids   UUID[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.order_courier_timeouts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id),
  courier_id  UUID NOT NULL REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_courier_timeouts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- dispatch_order_courier: two-pass candidate search.
-- Pass 1 excludes both permanently-declined and previously-timed-out
-- couriers. If that finds nobody AND at least one courier has timed out on
-- this order, pass 2 retries the same mode excluding only the permanently-
-- declined list — i.e. "offer it again to someone who didn't answer, if
-- there's truly nobody else".
-- ============================================================
CREATE OR REPLACE FUNCTION public.dispatch_order_courier(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order            RECORD;
  v_store            RECORD;
  v_mode             TEXT;
  v_bidmode          TEXT;
  v_radius           INTEGER;
  v_candidate_id     UUID;
  v_candidate_phone  TEXT;
  v_candidate_reward NUMERIC;
  v_reward           NUMERIC;
  v_excluded_ids     UUID[];
  v_pass             INTEGER;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT (v_order.status = 'looking_for_courier' AND v_order.is_delivery AND v_order.carry_courier_id IS NULL) THEN
    RETURN;
  END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = v_order.store_id;
  IF NOT FOUND OR v_store.delivery_courier_mode = 'manual' THEN
    RETURN;
  END IF;

  IF v_order.carry_mode_snapshot IS NULL THEN
    v_mode    := v_store.delivery_courier_mode;
    v_bidmode := v_store.delivery_carry_bid_mode;
    v_radius  := v_store.delivery_search_radius_m;

    UPDATE public.orders
    SET carry_mode_snapshot        = v_mode,
        carry_bid_mode_snapshot    = v_bidmode,
        carry_search_radius_used_m = v_radius
    WHERE id = p_order_id;
  ELSE
    v_mode    := v_order.carry_mode_snapshot;
    v_bidmode := v_order.carry_bid_mode_snapshot;
    v_radius  := v_order.carry_search_radius_used_m;
  END IF;

  IF v_mode NOT IN ('own_courier', 'carry') THEN
    RETURN;
  END IF;

  FOR v_pass IN 1..2 LOOP
    v_excluded_ids := v_order.carry_declined_courier_ids;
    IF v_pass = 1 THEN
      v_excluded_ids := v_excluded_ids || v_order.carry_offered_courier_ids;
    END IF;

    v_candidate_id := NULL; v_candidate_phone := NULL; v_candidate_reward := NULL;

    IF v_mode = 'own_courier' THEN
      SELECT p.id, p.phone
        INTO v_candidate_id, v_candidate_phone
      FROM public.profiles p
      JOIN public.store_couriers sc ON sc.courier_id = p.id AND sc.store_id = v_order.store_id
      WHERE p.is_courier = true AND NOT p.courier_banned
        AND p.courier_location_updated_at > now() - interval '5 minutes'
        AND p.id <> ALL(v_excluded_ids)
      ORDER BY public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) ASC NULLS LAST
      LIMIT 1;

      v_reward := NULL; -- reward is negotiated off-platform for a store's own courier

    ELSIF v_bidmode = 'auction' THEN
      SELECT p.id, p.phone, p.courier_min_reward
        INTO v_candidate_id, v_candidate_phone, v_candidate_reward
      FROM public.profiles p
      WHERE p.is_courier = true AND NOT p.courier_banned
        AND p.courier_city = v_store.city
        AND p.courier_lat IS NOT NULL AND p.courier_lng IS NOT NULL
        AND p.courier_min_reward IS NOT NULL AND p.courier_min_reward <= v_order.delivery_fee
        AND p.courier_location_updated_at > now() - interval '5 minutes'
        AND public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) <= v_radius
        AND p.id <> ALL(v_excluded_ids)
        AND NOT EXISTS (
          SELECT 1 FROM public.orders o2
          WHERE o2.carry_courier_id = p.id AND o2.id <> p_order_id
            AND o2.status NOT IN ('issued', 'cancelled')
        )
      ORDER BY p.courier_min_reward ASC,
               public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) ASC
      LIMIT 1
      FOR UPDATE OF p SKIP LOCKED;

      v_reward := v_candidate_reward;
    ELSE -- first_found
      SELECT p.id, p.phone
        INTO v_candidate_id, v_candidate_phone
      FROM public.profiles p
      WHERE p.is_courier = true AND NOT p.courier_banned
        AND p.courier_city = v_store.city
        AND p.courier_lat IS NOT NULL AND p.courier_lng IS NOT NULL
        AND p.courier_min_reward IS NOT NULL AND p.courier_min_reward <= v_order.delivery_fee
        AND p.courier_location_updated_at > now() - interval '5 minutes'
        AND public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) <= v_radius
        AND p.id <> ALL(v_excluded_ids)
        AND NOT EXISTS (
          SELECT 1 FROM public.orders o2
          WHERE o2.carry_courier_id = p.id AND o2.id <> p_order_id
            AND o2.status NOT IN ('issued', 'cancelled')
        )
      ORDER BY public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) ASC
      LIMIT 1
      FOR UPDATE OF p SKIP LOCKED;

      v_reward := v_order.delivery_fee;
    END IF;

    EXIT WHEN v_candidate_id IS NOT NULL;
    EXIT WHEN array_length(v_order.carry_offered_courier_ids, 1) IS NULL; -- nothing to retry with on pass 2
  END LOOP;

  IF v_candidate_id IS NULL THEN
    UPDATE public.orders
    SET carry_dispatch_status = 'no_couriers_found', carry_dispatched_at = now()
    WHERE id = p_order_id;
    RETURN;
  END IF;

  UPDATE public.orders
  SET carry_courier_id      = v_candidate_id,
      carry_courier_reward  = v_reward,
      carry_dispatch_status = 'assigned',
      carry_dispatched_at   = now(),
      carry_offer_expires_at = now() + interval '30 seconds',
      courier_phone         = v_candidate_phone
  WHERE id = p_order_id AND carry_courier_id IS NULL;

  PERFORM net.http_post(
    url     := 'https://alliby.ru/functions/v1/send-push',
    body    := jsonb_build_object(
                 'user_id', v_candidate_id,
                 'app',     'carry',
                 'type',    'carry_order_assigned',
                 'data',    jsonb_build_object('order_id', p_order_id::text)
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-push-secret', 'Zw8hHn4mv3ee1XzbX12H7EutpMv2lLyo'
               )
  );
END;
$$;

-- ============================================================
-- courier_decline_order: explicit decline now permanently excludes the
-- courier from this order (in addition to the existing audit insert).
-- ============================================================
CREATE OR REPLACE FUNCTION public.courier_decline_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.carry_courier_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not your assignment';
  END IF;
  IF v_order.status NOT IN ('looking_for_courier', 'handed_to_courier') THEN
    RAISE EXCEPTION 'Too late to decline — order already picked up';
  END IF;

  INSERT INTO public.order_courier_declines (order_id, courier_id)
  VALUES (p_order_id, auth.uid())
  ON CONFLICT DO NOTHING;

  UPDATE public.orders
  SET status                     = 'looking_for_courier',
      carry_courier_id           = NULL,
      carry_courier_reward       = NULL,
      courier_phone              = NULL,
      carry_dispatch_status      = 'none',
      carry_offer_expires_at     = NULL,
      carry_declined_courier_ids = array_append(carry_declined_courier_ids, auth.uid())
  WHERE id = p_order_id;

  PERFORM public.dispatch_order_courier(p_order_id);
END;
$$;

-- ============================================================
-- Timeout path: shared internal step + two callable entry points (courier's
-- own client, and the cron safety net below).
-- ============================================================
CREATE OR REPLACE FUNCTION public._expire_courier_offer(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_courier_id UUID;
BEGIN
  SELECT carry_courier_id INTO v_courier_id FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_courier_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.order_courier_timeouts (order_id, courier_id) VALUES (p_order_id, v_courier_id);

  UPDATE public.orders
  SET status                    = 'looking_for_courier',
      carry_courier_id          = NULL,
      carry_courier_reward      = NULL,
      courier_phone             = NULL,
      carry_dispatch_status     = 'none',
      carry_offer_expires_at    = NULL,
      carry_offered_courier_ids = array_append(carry_offered_courier_ids, v_courier_id)
  WHERE id = p_order_id;

  PERFORM public.dispatch_order_courier(p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.courier_timeout_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.carry_courier_id IS DISTINCT FROM auth.uid()
     OR v_order.carry_dispatch_status IS DISTINCT FROM 'assigned'
     OR v_order.carry_offer_expires_at IS NULL
     OR v_order.carry_offer_expires_at > now() THEN
    RAISE EXCEPTION 'Offer not expired';
  END IF;

  PERFORM public._expire_courier_offer(p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.courier_timeout_order(UUID) TO authenticated;

-- Courier explicitly confirms the offer (new "Принять" at the assignment
-- stage, before the physical handoff at the store). Just clears the timer —
-- the rest of the flow (handed_to_courier -> courier_accept_order ->
-- courier_mark_delivered) is unchanged.
CREATE OR REPLACE FUNCTION public.courier_confirm_offer(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET carry_offer_expires_at = NULL
  WHERE id = p_order_id AND carry_courier_id = auth.uid()
    AND status = 'looking_for_courier' AND carry_dispatch_status = 'assigned';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not assigned to you or offer already resolved';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.courier_confirm_offer(UUID) TO authenticated;

-- ============================================================
-- Cron safety net: the client is expected to call courier_timeout_order()
-- itself when its own 30s countdown reaches zero. This sweep only catches
-- offers whose courier app is closed/backgrounded and never called it.
-- Runs at 1-minute granularity (the coarsest guaranteed pg_cron interval) —
-- an offer can therefore sit expired-but-unswept for up to ~60s longer in
-- that edge case, which is acceptable for a backup path.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_courier_offers()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_count    INTEGER := 0;
BEGIN
  FOR v_order_id IN
    SELECT id FROM public.orders
    WHERE status = 'looking_for_courier'
      AND carry_dispatch_status = 'assigned'
      AND carry_offer_expires_at IS NOT NULL
      AND carry_offer_expires_at <= now()
  LOOP
    PERFORM public._expire_courier_offer(v_order_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

SELECT cron.schedule(
  'carry-expire-stale-offers',
  '* * * * *',
  $$ SELECT public.expire_stale_courier_offers(); $$
);

-- ============================================================
-- Manual admin retry: also re-open the timeout pool (a human explicitly
-- asked to broaden the search), but keep permanent declines intact — a
-- courier who explicitly said no shouldn't come back just because someone
-- clicked retry.
-- ============================================================
CREATE OR REPLACE FUNCTION public.retry_courier_dispatch(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  SELECT store_id INTO v_store_id FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT (public.is_platform_owner() OR public.is_store_owner_of(v_store_id) OR public.is_employee_of(v_store_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.orders
  SET carry_mode_snapshot        = NULL,
      carry_bid_mode_snapshot    = NULL,
      carry_search_radius_used_m = NULL,
      carry_offered_courier_ids  = '{}'
  WHERE id = p_order_id AND carry_courier_id IS NULL;

  PERFORM public.dispatch_order_courier(p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_courier_dispatch(UUID) TO authenticated;
