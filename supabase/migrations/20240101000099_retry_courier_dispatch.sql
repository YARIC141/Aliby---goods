-- ============================================================
-- Alliby Carry: manual retry when auto-dispatch found no courier
-- ============================================================

-- Thin, authorization-checked wrapper around dispatch_order_courier() for
-- admin/employee-triggered retries. dispatch_order_courier() itself is
-- SECURITY DEFINER with no caller-permission check (it was only ever invoked
-- from triggers before), so it can't be exposed directly to authenticated
-- clients — this wrapper adds the missing store-ownership check. The
-- underlying function already no-ops unless the order is still
-- looking_for_courier with no courier assigned, so a stray/late retry call
-- is harmless.
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

  PERFORM public.dispatch_order_courier(p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_courier_dispatch(UUID) TO authenticated;
