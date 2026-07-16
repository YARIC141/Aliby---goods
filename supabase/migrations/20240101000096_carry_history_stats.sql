-- ============================================================
-- Alliby Carry: order history / stats support
-- ============================================================

-- Needed so history/stats can show an accurate completion time and bucket
-- earnings by day/week/month — order_time only reflects order creation.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carry_delivered_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.courier_mark_delivered(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'issued', carry_delivered_at = now()
  WHERE id = p_order_id AND carry_courier_id = auth.uid() AND status = 'on_the_way';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not assigned to you or not in on_the_way status';
  END IF;
END;
$$;

-- Narrow, purpose-built RPC: lets the assigned courier see the customer's phone
-- only while actively delivering that specific order. Deliberately not solved via
-- a profiles RLS policy — an inline EXISTS-against-profiles policy caused an
-- infinite-recursion bug before (see migration 093); an RPC sidesteps that
-- entirely and also avoids exposing the customer's full profile row.
CREATE OR REPLACE FUNCTION public.get_order_customer_phone(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT;
BEGIN
  SELECT p.phone INTO v_phone
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.user_id
  WHERE o.id = p_order_id
    AND o.carry_courier_id = auth.uid()
    AND o.status IN ('looking_for_courier', 'on_the_way');
  RETURN v_phone;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_customer_phone(UUID) TO authenticated;
