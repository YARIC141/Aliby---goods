-- ============================================================
-- Alliby Carry (3/3): подбор и назначение курьера
-- ============================================================

-- Note: the push secret below matches the one already used by notify_order_status_push()
-- in 20240101000049_native_push.sql (WEBHOOK_SECRET in send-push's environment).

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

  -- Freeze the store's current settings onto the order on the first attempt, so a later
  -- settings change (or a re-match after a decline) doesn't shift the rules mid-flight.
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
    -- Curated per-store list: nearest courier wins regardless of current load (they
    -- simply queue behind whatever that courier is already doing) — no busy filter,
    -- no radius, no online-recency check. "Not found" only happens if the list is empty.
    SELECT p.id, p.phone
      INTO v_candidate_id, v_candidate_phone
    FROM public.profiles p
    JOIN public.store_couriers sc ON sc.courier_id = p.id AND sc.store_id = v_order.store_id
    WHERE p.role = 'courier' AND NOT p.courier_banned
      AND p.id NOT IN (SELECT courier_id FROM public.order_courier_declines WHERE order_id = p_order_id)
    ORDER BY public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) ASC NULLS LAST
    LIMIT 1;

    v_reward := NULL; -- reward is negotiated off-platform for a store's own courier

  ELSIF v_mode = 'carry' THEN
    -- Open city-wide pool: only free, online, in-city, in-radius couriers whose minimum
    -- reward the store's delivery price actually covers. FOR UPDATE SKIP LOCKED on the
    -- candidate row is what makes two orders racing for the same free courier safe: the
    -- loser simply skips the locked row and falls through to the next-best candidate.
    IF v_bidmode = 'auction' THEN
      SELECT p.id, p.phone, p.courier_min_reward
        INTO v_candidate_id, v_candidate_phone, v_candidate_reward
      FROM public.profiles p
      WHERE p.role = 'courier' AND NOT p.courier_banned
        AND p.courier_city = v_store.city
        AND p.courier_lat IS NOT NULL AND p.courier_lng IS NOT NULL
        AND p.courier_min_reward IS NOT NULL AND p.courier_min_reward <= v_order.delivery_fee
        AND p.courier_location_updated_at > now() - interval '5 minutes'
        AND public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) <= v_radius
        AND p.id NOT IN (SELECT courier_id FROM public.order_courier_declines WHERE order_id = p_order_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.orders o2
          WHERE o2.carry_courier_id = p.id AND o2.id <> p_order_id
            AND o2.status NOT IN ('issued', 'cancelled')
        )
      ORDER BY p.courier_min_reward ASC,
               public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) ASC
      LIMIT 1
      FOR UPDATE OF p SKIP LOCKED;

      v_reward := v_candidate_reward; -- winner is paid their own bid
    ELSE -- first_found
      SELECT p.id, p.phone
        INTO v_candidate_id, v_candidate_phone
      FROM public.profiles p
      WHERE p.role = 'courier' AND NOT p.courier_banned
        AND p.courier_city = v_store.city
        AND p.courier_lat IS NOT NULL AND p.courier_lng IS NOT NULL
        AND p.courier_min_reward IS NOT NULL AND p.courier_min_reward <= v_order.delivery_fee
        AND p.courier_location_updated_at > now() - interval '5 minutes'
        AND public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) <= v_radius
        AND p.id NOT IN (SELECT courier_id FROM public.order_courier_declines WHERE order_id = p_order_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.orders o2
          WHERE o2.carry_courier_id = p.id AND o2.id <> p_order_id
            AND o2.status NOT IN ('issued', 'cancelled')
        )
      ORDER BY public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) ASC
      LIMIT 1
      FOR UPDATE OF p SKIP LOCKED;

      v_reward := v_order.delivery_fee; -- winner is paid the full posted price
    END IF;
  ELSE
    RETURN; -- unset/unknown mode — nothing to do
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

-- Thin trigger wrapper — the trigger itself never touches `status`, so scoping it to
-- `UPDATE OF status` means dispatch_order_courier()'s own updates (carry_*/courier_phone
-- only) never re-fire it. No recursion guard needed.
CREATE OR REPLACE FUNCTION public.carry_dispatch_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.dispatch_order_courier(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_carry_dispatch ON public.orders;
CREATE TRIGGER trg_carry_dispatch
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'looking_for_courier' AND NEW.is_delivery AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.carry_dispatch_trigger();

-- Courier declines an assignment before pickup — excludes them and re-runs the match.
-- Not available once the order is already on_the_way (post-pickup is manual/admin territory).
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
  IF v_order.status <> 'looking_for_courier' THEN
    RAISE EXCEPTION 'Too late to decline — order already picked up';
  END IF;

  INSERT INTO public.order_courier_declines (order_id, courier_id)
  VALUES (p_order_id, auth.uid())
  ON CONFLICT DO NOTHING;

  UPDATE public.orders
  SET carry_courier_id      = NULL,
      carry_courier_reward  = NULL,
      courier_phone         = NULL,
      carry_dispatch_status = 'none'
  WHERE id = p_order_id;

  PERFORM public.dispatch_order_courier(p_order_id);
END;
$$;

-- Courier marks an order picked up — the looking_for_courier -> on_the_way transition
-- that admin does manually today; for Carry-dispatched orders the courier does it instead.
CREATE OR REPLACE FUNCTION public.courier_mark_picked_up(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'on_the_way'
  WHERE id = p_order_id AND carry_courier_id = auth.uid() AND status = 'looking_for_courier';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not assigned to you or not in looking_for_courier status';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_order_courier(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_decline_order(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.courier_mark_picked_up(UUID)  TO authenticated;

-- Adjacent fix (not Carry-specific, but touched while we're in this area): the client
-- push trigger never covered looking_for_courier/on_the_way, so today a client gets zero
-- push when a courier is found or picks up — only in-app realtime. Adding both, matching
-- new PUSH_TEMPLATES entries added to send-push/index.ts.
CREATE OR REPLACE FUNCTION public.notify_order_status_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_type := CASE NEW.status
    WHEN 'in_progress'         THEN 'order_in_progress'
    WHEN 'looking_for_courier' THEN 'order_looking_for_courier'
    WHEN 'on_the_way'          THEN 'order_on_the_way'
    WHEN 'ready'               THEN 'order_ready'
    WHEN 'issued'              THEN 'order_issued'
    WHEN 'cancelled'           THEN 'order_cancelled'
    ELSE NULL
  END;

  IF v_type IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := 'https://alliby.ru/functions/v1/send-push',
    body    := jsonb_build_object(
                 'user_id', NEW.user_id,
                 'type',    v_type,
                 'data',    jsonb_build_object('order_id', NEW.id::text)
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-push-secret', 'Zw8hHn4mv3ee1XzbX12H7EutpMv2lLyo'
               )
  );

  RETURN NEW;
END;
$$;
