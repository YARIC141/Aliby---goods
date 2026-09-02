-- Migration 130: Enforce rent capacity server-side on INSERT/UPDATE
--
-- get_rent_availability / get_rent_days_availability / get_rent_slots_availability
-- are only advisory — they compute a number for the UI to grey out days/slots,
-- but nothing ever re-checked capacity when a reservation row was actually
-- inserted. The RLS policy on rent_reservations only checks
-- `user_id = auth.uid()`; the old stock trigger from migration 072 (dropped in
-- 121) never enforced a capacity limit either, only maintained a display
-- counter. Two consequences:
--   1. A race: two clients can both pass the client-side availability check
--      for the same slot before either one's INSERT lands, and both succeed,
--      overbooking the item by 1+ units.
--   2. Nothing stops a direct REST call (bypassing the calendar UI entirely)
--      from inserting a reservation for more units than are actually free.
--
-- Fix: a BEFORE INSERT/UPDATE trigger that, for any row landing in
-- ('pending','active'), takes an item-scoped advisory lock (serializing
-- concurrent attempts for the same item) and computes the peak concurrent
-- quantity over [start_at, end_at) — including the row being written,
-- excluding its own previous version on UPDATE — against every other
-- overlapping reservation still counted by the availability RPCs (same
-- status/payment/grace-period rules as migration 128). If that peak would
-- exceed total_quantity, the write is rejected.

CREATE OR REPLACE FUNCTION public.rent_reservation_capacity_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total INT;
  v_peak  INT;
BEGIN
  IF NEW.status NOT IN ('pending', 'active') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.item_id::text, 0));

  SELECT total_quantity INTO v_total
  FROM public.menu_items
  WHERE id = NEW.item_id;

  IF v_total IS NULL THEN
    RETURN NEW;
  END IF;

  WITH events AS (
    SELECT NEW.start_at AS t, NEW.quantity AS delta
    UNION ALL
    SELECT NEW.end_at, -NEW.quantity
    UNION ALL
    SELECT r.start_at, r.quantity
    FROM public.rent_reservations r
    WHERE r.item_id = NEW.item_id
      AND r.id <> NEW.id
      AND r.status IN ('pending', 'active')
      AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
      AND r.start_at < NEW.end_at AND r.end_at > NEW.start_at
    UNION ALL
    SELECT r.end_at, -r.quantity
    FROM public.rent_reservations r
    WHERE r.item_id = NEW.item_id
      AND r.id <> NEW.id
      AND r.status IN ('pending', 'active')
      AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
      AND r.start_at < NEW.end_at AND r.end_at > NEW.start_at
  )
  SELECT MAX(running) INTO v_peak
  FROM (
    SELECT SUM(delta) OVER (
      ORDER BY t, delta
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running
    FROM events
  ) x;

  IF v_peak > v_total THEN
    RAISE EXCEPTION 'Недостаточно свободного количества для бронирования на выбранное время'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rent_reservation_capacity_check ON public.rent_reservations;
CREATE TRIGGER rent_reservation_capacity_check
  BEFORE INSERT OR UPDATE ON public.rent_reservations
  FOR EACH ROW EXECUTE FUNCTION public.rent_reservation_capacity_check();
