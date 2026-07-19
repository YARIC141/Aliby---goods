-- ============================================================
-- Manual courier-search retry re-syncs to the store's current mode
-- ============================================================
-- Bug found live: a Грильяж delivery order got stuck with
-- carry_dispatch_status = 'no_couriers_found' while the store was still on
-- carry/auction mode. The store then switched to own_courier, but clicking
-- "Повторить поиск курьера" kept searching under the OLD frozen
-- carry_mode_snapshot — dispatch_order_courier() only re-reads the store's
-- live settings when the snapshot is NULL (by design, see migration 090: the
-- snapshot exists so a store changing mode mid-flight doesn't change the
-- rules of an already-in-progress/decline-replayed match). That protection
-- makes sense for courier_decline_order()'s automatic re-match (a courier
-- already engaged with the order under the old rules) but not for this
-- admin-triggered manual retry — no courier has engaged yet (that's exactly
-- why the retry button is showing), so it should just search under whatever
-- the store is configured for right now.
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
  SET carry_mode_snapshot = NULL, carry_bid_mode_snapshot = NULL, carry_search_radius_used_m = NULL
  WHERE id = p_order_id AND carry_courier_id IS NULL;

  PERFORM public.dispatch_order_courier(p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_courier_dispatch(UUID) TO authenticated;
