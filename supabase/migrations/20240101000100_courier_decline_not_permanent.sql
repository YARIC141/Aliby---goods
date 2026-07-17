-- ============================================================
-- Alliby Carry: a decline is not a permanent block on that order
-- ============================================================
-- Previous design: order_courier_declines permanently excluded a courier
-- from ever being re-matched to the SAME order once they declined it. User
-- correction: that's wrong — the courier should be reconsidered on any
-- later dispatch attempt (including admin's manual retry). The intended way
-- to stop being offered orders at all is to go off shift (stop pinging
-- location), not a per-order block.
--
-- This has one consequence that needs handling: own_courier matching never
-- checked online/shift status at all (by original design, a staff courier
-- was assumed always "working" when assigned). Without decline-exclusion,
-- that means declining would immediately re-offer the same order right back
-- to a still-"available" solo store courier with no way to opt out — which
-- contradicts "turn off the shift toggle to stop receiving orders". So
-- own_courier matching now also requires a recent location ping (same
-- 5-minute freshness window carry mode already uses), making the shift
-- toggle meaningful for both modes.
--
-- order_courier_declines itself is kept (still recorded by
-- courier_decline_order) as a plain audit log — it's just no longer read
-- by the matching queries below.

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

  IF v_mode = 'own_courier' THEN
    -- Curated per-store list: nearest courier wins, queued behind whatever
    -- they're already doing. Now also requires a recent location ping (same
    -- 5-minute window as carry mode) so the shift toggle is the one real
    -- way to stop being offered orders — a decline no longer blocks
    -- re-matching on its own.
    SELECT p.id, p.phone
      INTO v_candidate_id, v_candidate_phone
    FROM public.profiles p
    JOIN public.store_couriers sc ON sc.courier_id = p.id AND sc.store_id = v_order.store_id
    WHERE p.is_courier = true AND NOT p.courier_banned
      AND p.courier_location_updated_at > now() - interval '5 minutes'
    ORDER BY public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) ASC NULLS LAST
    LIMIT 1;

    v_reward := NULL; -- reward is negotiated off-platform for a store's own courier

  ELSIF v_mode = 'carry' THEN
    IF v_bidmode = 'auction' THEN
      SELECT p.id, p.phone, p.courier_min_reward
        INTO v_candidate_id, v_candidate_phone, v_candidate_reward
      FROM public.profiles p
      WHERE p.is_courier = true AND NOT p.courier_banned
        AND p.courier_city = v_store.city
        AND p.courier_lat IS NOT NULL AND p.courier_lng IS NOT NULL
        AND p.courier_min_reward IS NOT NULL AND p.courier_min_reward <= v_order.delivery_fee
        AND p.courier_location_updated_at > now() - interval '5 minutes'
        AND public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) <= v_radius
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
  ELSE
    RETURN;
  END IF;

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
