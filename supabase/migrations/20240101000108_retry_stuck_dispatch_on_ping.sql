-- A "no_couriers_found" order (own_courier: none of the store's couriers were
-- on shift; carry: no eligible courier was online in the city) previously
-- just sat there until the store owner noticed and clicked "Повторить поиск
-- курьера" by hand. Now: every time a courier pings their location (i.e.
-- goes on shift / stays on shift), we opportunistically retry any stuck
-- order they could plausibly resolve — own_courier orders for stores that
-- list them, or carry orders for stores in their city. dispatch_order_courier()
-- re-validates full eligibility itself, so this is just "wake up and recheck",
-- not a second source of truth.

CREATE INDEX IF NOT EXISTS idx_orders_stuck_dispatch ON public.orders(store_id)
  WHERE is_delivery AND status = 'looking_for_courier' AND carry_courier_id IS NULL
    AND carry_dispatch_status = 'no_couriers_found';

CREATE OR REPLACE FUNCTION public.update_courier_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stuck_order_id UUID;
BEGIN
  UPDATE public.profiles
  SET courier_lat                 = p_lat,
      courier_lng                 = p_lng,
      courier_location_updated_at = now()
  WHERE id = auth.uid() AND is_courier = true AND NOT courier_banned;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a courier account (or banned)';
  END IF;

  FOR v_stuck_order_id IN
    SELECT o.id
    FROM public.orders o
    JOIN public.stores s ON s.id = o.store_id
    WHERE o.is_delivery
      AND o.status = 'looking_for_courier'
      AND o.carry_courier_id IS NULL
      AND o.carry_dispatch_status = 'no_couriers_found'
      AND (
        (s.delivery_courier_mode = 'own_courier' AND EXISTS (
           SELECT 1 FROM public.store_couriers sc
           WHERE sc.store_id = s.id AND sc.courier_id = auth.uid()
         ))
        OR
        (s.delivery_courier_mode = 'carry' AND s.city = (
           SELECT courier_city FROM public.profiles WHERE id = auth.uid()
         ))
      )
  LOOP
    PERFORM public.dispatch_order_courier(v_stuck_order_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_courier_location(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
