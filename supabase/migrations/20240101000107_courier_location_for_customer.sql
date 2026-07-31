-- Let the customer see the assigned courier's current position on a map,
-- but only once the courier has actually picked up their order — before
-- that (looking_for_courier/handed_to_courier) the courier isn't headed
-- anywhere yet, so showing a "live" pin would be misleading. Scoped to the
-- order's own customer, mirrors the existing get_order_customer_phone()
-- pattern.
CREATE OR REPLACE FUNCTION public.get_order_courier_location(p_order_id UUID)
RETURNS TABLE(lat DOUBLE PRECISION, lng DOUBLE PRECISION, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.courier_lat, p.courier_lng, p.courier_location_updated_at
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.carry_courier_id
  WHERE o.id = p_order_id
    AND o.user_id = auth.uid()
    AND o.carry_courier_id IS NOT NULL
    AND o.status IN ('accepted_by_courier', 'on_the_way');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_courier_location(UUID) TO authenticated;
