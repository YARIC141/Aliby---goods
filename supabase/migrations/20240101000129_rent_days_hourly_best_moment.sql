-- Migration 129: Day-grid availability must use best moment, not worst, for hour/minute rentals
--
-- Migration 128 replaced day-level SUM with peak concurrency (the busiest
-- instant of the day), fixing the double-counting of non-overlapping same-day
-- reservations. But for hour/minute-unit items that's still the wrong metric
-- for the calendar DAY grid: if even one hour anywhere in the day is fully
-- booked, the peak-concurrent quantity for the whole day hits total_quantity,
-- so the whole day is still shown as unavailable — exactly the bug being
-- reported, just from a different angle. A day should only be greyed out in
-- the day-grid if there's truly no free moment in it; for hour/minute items,
-- other hours that day remain individually bookable (get_rent_slots_availability
-- already handles picking the right one).
--
-- Fix: split behavior by rent_period_unit.
--   - day/week/month items: a reservation occupies the entire day, so the
--     worst moment (max concurrent) is the right, and only, meaningful
--     number — unchanged from migration 128.
--   - hour/minute items: use the best moment (min concurrent) of the day, so
--     the day-grid only marks a day fully off when nothing on it can ever
--     fit the requested quantity. Picking the actual time still goes through
--     get_rent_slots_availability, which was already correct per-slot.

CREATE OR REPLACE FUNCTION public.get_rent_days_availability(
  p_item_id UUID,
  p_year    INT,
  p_month   INT
)
RETURNS TABLE (day DATE, available INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      make_date(p_year, p_month, 1),
      make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
      INTERVAL '1 day'
    )::DATE AS d
  ),
  item_info AS (
    SELECT total_quantity, rent_period_unit FROM public.menu_items WHERE id = p_item_id
  ),
  baselines AS (
    -- quantity already reserved and active at the exact start of the day
    SELECT
      d.d,
      COALESCE((
        SELECT SUM(r.quantity)
        FROM public.rent_reservations r
        WHERE r.item_id = p_item_id
          AND r.status IN ('pending', 'active')
          AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
          AND r.start_at <= d.d::TIMESTAMPTZ
          AND r.end_at   >  d.d::TIMESTAMPTZ
      ), 0)::INT AS baseline
    FROM days d
  ),
  levels AS (
    -- running concurrency level (baseline + in-day start/end deltas) sampled
    -- right after every in-day event; the day's true min/max concurrency is
    -- among these samples plus the baseline itself (the level before the
    -- first in-day event)
    SELECT
      b.d,
      b.baseline,
      MIN(b.baseline + sweep.running) AS min_running,
      MAX(b.baseline + sweep.running) AS max_running
    FROM baselines b
    LEFT JOIN LATERAL (
      SELECT SUM(ev.delta) OVER (
        ORDER BY ev.t, ev.delta
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS running
      FROM (
        SELECT r.start_at AS t, r.quantity AS delta
        FROM public.rent_reservations r
        WHERE r.item_id = p_item_id
          AND r.status IN ('pending', 'active')
          AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
          AND r.start_at >= b.d::TIMESTAMPTZ
          AND r.start_at <  (b.d + INTERVAL '1 day')::TIMESTAMPTZ
        UNION ALL
        SELECT r.end_at, -r.quantity
        FROM public.rent_reservations r
        WHERE r.item_id = p_item_id
          AND r.status IN ('pending', 'active')
          AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
          AND r.end_at >  b.d::TIMESTAMPTZ
          AND r.end_at <= (b.d + INTERVAL '1 day')::TIMESTAMPTZ
      ) ev(t, delta)
    ) sweep ON true
    GROUP BY b.d, b.baseline
  )
  SELECT
    l.d AS day,
    GREATEST((
      i.total_quantity - (
        CASE
          WHEN i.rent_period_unit IN ('hour', 'minute')
            THEN COALESCE(l.min_running, l.baseline)
          ELSE COALESCE(l.max_running, l.baseline)
        END
      )
    )::INT, 0) AS available
  FROM levels l
  CROSS JOIN item_info i
  ORDER BY l.d;
$$;
