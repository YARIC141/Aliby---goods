-- ============================================================
-- Alliby Carry: dispatch on payment, not on the manual "Ищем курьера" click
-- ============================================================
-- Previously, courier search only started once admin manually advanced a delivery
-- order to looking_for_courier (admin/index.html's "Ищем курьера" button) — the same
-- step manual-mode stores still use today. For stores with delivery_courier_mode IN
-- ('own_courier','carry'), that manual step shouldn't exist at all: the courier search
-- must start the moment the order is paid, running in parallel with the kitchen
-- preparing it, with no admin action required until they're ready to hand the order
-- to the (already-assigned) courier.
--
-- Orders are always born already status='paid' (both tbank-init's free branch and
-- tbank-store-notify's webhook INSERT directly with status:'paid' — there is no
-- separate pending-then-paid UPDATE step for delivery orders today), so this needs to
-- fire on INSERT as well as UPDATE OF status.
--
-- No admin/index.html changes needed: its order-detail action button already keys off
-- the order's *current* status (paid -> in_progress -> looking_for_courier -> ...), so
-- once this trigger jumps a delivery order straight to looking_for_courier, the UI
-- naturally offers "Едет к вам" as the very next action — in_progress and the manual
-- "Ищем курьера" click are simply skipped for these stores, exactly as intended.

CREATE OR REPLACE FUNCTION public.carry_auto_dispatch_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
BEGIN
  SELECT delivery_courier_mode INTO v_mode FROM public.stores WHERE id = NEW.store_id;

  IF v_mode IN ('own_courier', 'carry') THEN
    UPDATE public.orders SET status = 'looking_for_courier' WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_carry_auto_dispatch ON public.orders;
CREATE TRIGGER trg_carry_auto_dispatch
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND NEW.is_delivery)
  EXECUTE FUNCTION public.carry_auto_dispatch_trigger();
