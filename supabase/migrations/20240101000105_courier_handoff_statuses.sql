-- ============================================================
-- Two-step courier handoff: передано_курьеру / принято_курьером
-- ============================================================
-- Previously, once Alliby Carry auto-assigned a courier, the ADMIN alone
-- decided when the order moved to on_the_way ("Едет к вам") — a guess, not
-- a confirmation the courier actually has the order. New flow for orders
-- with an assigned Carry courier (carry_courier_id IS NOT NULL):
--   looking_for_courier -> handed_to_courier (admin marks handoff)
--                        -> accepted_by_courier (courier taps "Принять")
--                        -> issued (courier taps "Доставил", as before)
-- on_the_way is kept only for manual-mode deliveries (no Carry courier) —
-- that flow is untouched.

-- 1. Courier confirms receipt of a handed-over order.
CREATE OR REPLACE FUNCTION public.courier_accept_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'accepted_by_courier'
  WHERE id = p_order_id AND carry_courier_id = auth.uid() AND status = 'handed_to_courier';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not assigned to you or not ready to accept';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.courier_accept_order(UUID) TO authenticated;

-- 2. Decline is now possible up through handed_to_courier (not just
-- looking_for_courier) — the courier hasn't committed until they explicitly
-- accept. A decline from handed_to_courier must put the order back to
-- looking_for_courier, otherwise dispatch_order_courier() (which only acts
-- on looking_for_courier orders) would silently no-op and leave it stranded.
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
  SET status                = 'looking_for_courier',
      carry_courier_id      = NULL,
      carry_courier_reward  = NULL,
      courier_phone         = NULL,
      carry_dispatch_status = 'none'
  WHERE id = p_order_id;

  PERFORM public.dispatch_order_courier(p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.courier_decline_order(UUID) TO authenticated;

-- 3. "Доставил" now fires from either accepted_by_courier (new flow) or
-- on_the_way (legacy in-flight orders assigned before this migration, and
-- any future manual-mode edge case) — both mean the same thing: the courier
-- has the order and is confirming delivery.
CREATE OR REPLACE FUNCTION public.courier_mark_delivered(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'issued', carry_delivered_at = now()
  WHERE id = p_order_id AND carry_courier_id = auth.uid()
    AND status IN ('on_the_way', 'accepted_by_courier');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not assigned to you or not ready to be marked delivered';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.courier_mark_delivered(UUID) TO authenticated;

-- 4. The customer-phone lookup the courier's order card uses is gated by
-- status too — extend it to the two new statuses so the phone still shows
-- once an order moves past looking_for_courier/on_the_way.
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
    AND o.status IN ('looking_for_courier', 'handed_to_courier', 'accepted_by_courier', 'on_the_way');
  RETURN v_phone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_customer_phone(UUID) TO authenticated;

-- 5. Push the courier when the admin hands the order over, so they notice
-- there's a "Принять" waiting for them — same trigger that already pushes
-- the customer on other status changes.
CREATE OR REPLACE FUNCTION notify_order_status_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF NEW.status = 'handed_to_courier' AND NEW.carry_courier_id IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://alliby.ru/functions/v1/send-push',
      body    := jsonb_build_object(
                   'user_id', NEW.carry_courier_id,
                   'app',     'carry',
                   'type',    'carry_order_handed',
                   'data',    jsonb_build_object('order_id', NEW.id::text)
                 ),
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'x-push-secret', 'Zw8hHn4mv3ee1XzbX12H7EutpMv2lLyo'
                 )
    );
    RETURN NEW;
  END IF;

  v_type := CASE NEW.status
    WHEN 'in_progress' THEN 'order_in_progress'
    WHEN 'ready'       THEN 'order_ready'
    WHEN 'issued'      THEN 'order_issued'
    WHEN 'cancelled'   THEN 'order_cancelled'
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
