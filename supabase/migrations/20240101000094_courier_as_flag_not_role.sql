-- ============================================================
-- Courier becomes an additive capability flag, not a replacement role
-- ============================================================
-- Problem found while testing: register_courier() required role='user' and flipped it
-- to role='courier'. Alliby Admin's login gate explicitly requires
-- role IN ('admin','employee') (admin/index.html:2458) — so any admin or employee who
-- became a courier under the old design would immediately lose access to Alliby Admin
-- entirely ("Нет прав доступа"). No real courier profiles exist yet (verified live),
-- so this is safe to redesign cleanly rather than patch around.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_courier BOOLEAN NOT NULL DEFAULT false;

-- Registration no longer requires (or touches) role — any account type (user, admin,
-- employee) can additionally become a courier without affecting their existing access.
CREATE OR REPLACE FUNCTION public.register_courier(
  p_full_name  TEXT,
  p_phone      TEXT,
  p_city       TEXT,
  p_min_reward NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_min_reward IS NULL OR p_min_reward < 0 THEN
    RAISE EXCEPTION 'p_min_reward must be a non-negative number';
  END IF;

  UPDATE public.profiles
  SET is_courier           = true,
      full_name            = COALESCE(p_full_name, full_name),
      phone                = COALESCE(p_phone, phone),
      courier_city         = p_city,
      courier_min_reward   = p_min_reward
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_courier_profile(
  p_full_name  TEXT,
  p_phone      TEXT,
  p_city       TEXT,
  p_min_reward NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_min_reward IS NULL OR p_min_reward < 0 THEN
    RAISE EXCEPTION 'p_min_reward must be a non-negative number';
  END IF;

  UPDATE public.profiles
  SET full_name          = COALESCE(p_full_name, full_name),
      phone              = COALESCE(p_phone, phone),
      courier_city       = p_city,
      courier_min_reward = p_min_reward
  WHERE id = auth.uid() AND is_courier = true AND NOT courier_banned;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a courier account (or banned)';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_courier_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET courier_lat                 = p_lat,
      courier_lng                 = p_lng,
      courier_location_updated_at = now()
  WHERE id = auth.uid() AND is_courier = true AND NOT courier_banned;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a courier account (or banned)';
  END IF;
END;
$$;

-- RLS: store admins/employees look up couriers by is_courier now, not role.
DROP POLICY IF EXISTS "profiles: select couriers for store admins" ON public.profiles;
CREATE POLICY "profiles: select couriers for store admins"
  ON public.profiles FOR SELECT
  USING (
    is_courier = true
    AND (public.is_platform_owner() OR public.is_admin_or_employee())
  );

-- Matching-function candidate queries: is_courier instead of role='courier'.
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
    SELECT p.id, p.phone
      INTO v_candidate_id, v_candidate_phone
    FROM public.profiles p
    JOIN public.store_couriers sc ON sc.courier_id = p.id AND sc.store_id = v_order.store_id
    WHERE p.is_courier = true AND NOT p.courier_banned
      AND p.id NOT IN (SELECT courier_id FROM public.order_courier_declines WHERE order_id = p_order_id)
    ORDER BY public.haversine_m(p.courier_lat, p.courier_lng, v_store.latitude, v_store.longitude) ASC NULLS LAST
    LIMIT 1;

    v_reward := NULL;

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

      v_reward := v_candidate_reward;
    ELSE
      SELECT p.id, p.phone
        INTO v_candidate_id, v_candidate_phone
      FROM public.profiles p
      WHERE p.is_courier = true AND NOT p.courier_banned
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
