-- ============================================================
-- Alliby Carry: курьер сам подтверждает доставку
-- ============================================================
-- Corrects the pickup/delivery split from the original spec: the store (admin) confirms
-- pickup (looking_for_courier -> on_the_way, unchanged, still the existing manual button
-- in Alliby Admin — the store owner is the one physically handing the order over), while
-- the COURIER confirms final delivery (on_the_way -> issued), since admin isn't present
-- for that moment. courier_mark_picked_up() from 20240101000091 is superseded by this
-- split and is simply left unused (harmless — narrowly scoped, not wired into any app).

CREATE OR REPLACE FUNCTION public.courier_mark_delivered(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'issued'
  WHERE id = p_order_id AND carry_courier_id = auth.uid() AND status = 'on_the_way';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not assigned to you or not in on_the_way status';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.courier_mark_delivered(UUID) TO authenticated;

-- Courier needs to SELECT their own assigned orders (active-order card, realtime
-- subscription) — today's policy only covers the buyer and store side.
DROP POLICY IF EXISTS "orders: select own or admin or employee" ON public.orders;
CREATE POLICY "orders: select own or admin or employee or courier"
  ON public.orders FOR SELECT
  USING (
    user_id = auth.uid()
    OR carry_courier_id = auth.uid()
    OR public.is_platform_owner()
    OR public.is_store_owner_of(store_id)
    OR public.is_employee_of(store_id)
  );
