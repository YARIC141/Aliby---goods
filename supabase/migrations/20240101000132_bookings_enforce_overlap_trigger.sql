-- Migration 132: Enforce booking overlap server-side on INSERT/UPDATE
--
-- Same class of bug as migration 130 (rent), but for bookings: the calendar
-- UI (index.html ~3850/~10047/~10072) fetches existing bookings and greys
-- out taken slots client-side, but nothing on the server ever re-checked
-- that a slot was still free when the row was actually inserted. The RLS
-- policy on bookings only checks `user_id = auth.uid()`. Consequences:
--   1. A race: two clients can both pass the client-side slot check for the
--      same master/store+time before either one's INSERT lands, and both
--      succeed, double-booking the same master (or the same store-wide
--      single-resource slot when no master is assigned).
--   2. Nothing stops a direct REST call (bypassing the calendar UI
--      entirely) from inserting a booking for an already-taken slot.
--
-- Exclusivity scope mirrors what the client itself already assumes:
--   - master_id IS NOT NULL: the master's time is the exclusive resource
--     (client checks by master_id alone, across all stores/items).
--   - master_id IS NULL: bookings without an assigned master share one
--     store-wide resource (client checks by store_id alone, across all
--     items — see the `else` branch loading `store_schedules`).
--
-- Fix: a BEFORE INSERT/UPDATE trigger that, for any row landing in status
-- 'booked' (the only status that occupies a slot — 'cancelled' and
-- 'rescheduled' both free it, per confirmBooking() in the client, which
-- flips an old row to 'rescheduled' when moving it to a new slot), takes
-- an advisory lock scoped to the resource (master_id, or store_id when no
-- master), then rejects the write if another row for the same resource and
-- slot_date has an overlapping [slot_start, slot_end).

CREATE OR REPLACE FUNCTION public.booking_overlap_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_lock_key TEXT;
  v_conflict BOOLEAN;
BEGIN
  IF NEW.status <> 'booked' THEN
    RETURN NEW;
  END IF;

  v_lock_key := COALESCE(NEW.master_id::text, 'store:' || NEW.store_id::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  IF NEW.master_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.master_id = NEW.master_id
        AND b.id <> NEW.id
        AND b.slot_date = NEW.slot_date
        AND b.status = 'booked'
        AND b.slot_start < NEW.slot_end
        AND b.slot_end   > NEW.slot_start
    ) INTO v_conflict;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.store_id = NEW.store_id
        AND b.master_id IS NULL
        AND b.id <> NEW.id
        AND b.slot_date = NEW.slot_date
        AND b.status = 'booked'
        AND b.slot_start < NEW.slot_end
        AND b.slot_end   > NEW.slot_start
    ) INTO v_conflict;
  END IF;

  IF v_conflict THEN
    RAISE EXCEPTION 'Это время уже занято, выберите другой слот'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_overlap_check ON public.bookings;
CREATE TRIGGER booking_overlap_check
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.booking_overlap_check();
