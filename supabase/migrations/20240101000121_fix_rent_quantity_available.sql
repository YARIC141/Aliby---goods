-- Migration 121: Fix broken rent quantity_available tracking
--
-- rent_reservation_stock_trigger (added in 072) decremented the global
-- menu_items.quantity_available on every new reservation regardless of the
-- reservation's date range, and only credited it back on a completed/cancelled
-- status transition that nothing in the app ever performs (the T-Bank payment
-- webhook only sets payment_status='paid', it never advances the reservation's
-- own status). So quantity_available drains monotonically and, once it would
-- go negative, the `quantity_available >= 0` check aborts the INSERT — which
-- surfaces to the user as a failed rent payment.
--
-- Real availability is (and always was) computed correctly and independently
-- via get_rent_availability / get_rent_days_availability, which sum only
-- reservations that overlap the requested date range against total_quantity.
-- Neither RPC reads quantity_available at all, so the trigger's bookkeeping
-- was never load-bearing for booking logic — only for an admin display field.
-- Dropping it removes the failure mode entirely.

DROP TRIGGER IF EXISTS rent_reservation_stock ON public.rent_reservations;
DROP FUNCTION IF EXISTS public.rent_reservation_stock_trigger();

-- Reset the stale, artificially-drained counter on existing rental items so
-- the admin "available qty" field isn't stuck showing an incorrect low value.
UPDATE public.menu_items
SET quantity_available = total_quantity
WHERE item_type = 'rental' AND total_quantity IS NOT NULL;
