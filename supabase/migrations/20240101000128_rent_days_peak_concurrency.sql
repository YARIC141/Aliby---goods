-- Migration 128: Fix day-level rent availability for hour/minute-unit items
--
-- get_rent_days_availability computed reserved_qty for a day as SUM(quantity)
-- of every reservation overlapping that day. That's correct for day/week/
-- month-unit rentals (a reservation occupies the whole day, so two of them
-- touching the same day really do compete for the same pool at once), but
-- wrong for hour/minute-unit rentals: a 09:00-10:00 booking and a 15:00-16:00
-- booking on the same day never need the item simultaneously, yet their
-- quantities were summed as if they did — so a day with just one occupied
-- hour could show as fully unavailable (or block a qty that was actually
-- free all day except that one hour), even though get_rent_slots_availability
-- (used one screen later, for picking the actual time) computed the correct
-- per-slot number all along.
--
-- Fix: replace the day-level SUM with the peak concurrently-reserved
-- quantity at any point during the day (classic sweep-line: +quantity at
-- start_at, -quantity at end_at, running total, take the max). For day/week/
-- month-unit items this is equivalent to the old SUM (their reservations
-- fully overlap for the whole day), so behavior there is unchanged.
--
-- get_rent_availability has the same SUM-overcounts-non-overlapping-
-- reservations flaw for its arbitrary [p_start,p_end) window; fixed the same
-- way for consistency, even though no current app code calls it.

CREATE OR REPLACE FUNCTION public.get_rent_availability(
  p_item_id UUID,
  p_start   TIMESTAMPTZ,
  p_end     TIMESTAMPTZ
)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH item_info AS (
    SELECT total_quantity FROM public.menu_items WHERE id = p_item_id
  ),
  events AS (
    SELECT r.start_at AS t, r.quantity AS delta
    FROM public.rent_reservations r
    WHERE r.item_id = p_item_id
      AND r.status IN ('pending', 'active')
      AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
      AND r.start_at < p_end
      AND r.end_at   > p_start
    UNION ALL
    SELECT r.end_at, -r.quantity
    FROM public.rent_reservations r
    WHERE r.item_id = p_item_id
      AND r.status IN ('pending', 'active')
      AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
      AND r.start_at < p_end
      AND r.end_at   > p_start
  ),
  running AS (
    SELECT SUM(delta) OVER (ORDER BY t, delta ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS qty
    FROM events
  )
  SELECT GREATEST((i.total_quantity - COALESCE((SELECT MAX(qty) FROM running), 0))::INT, 0)
  FROM item_info i;
$$;

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
    SELECT total_quantity FROM public.menu_items WHERE id = p_item_id
  ),
  peak AS (
    SELECT
      d.d,
      COALESCE(MAX(sweep.running), 0) AS peak_qty
    FROM days d
    LEFT JOIN LATERAL (
      SELECT SUM(ev.delta) OVER (ORDER BY ev.t, ev.delta ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
      FROM (
        SELECT r.start_at AS t, r.quantity AS delta
        FROM public.rent_reservations r
        WHERE r.item_id = p_item_id
          AND r.status IN ('pending', 'active')
          AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
          AND r.start_at < (d.d + INTERVAL '1 day')
          AND r.end_at   > d.d::TIMESTAMPTZ
        UNION ALL
        SELECT r.end_at, -r.quantity
        FROM public.rent_reservations r
        WHERE r.item_id = p_item_id
          AND r.status IN ('pending', 'active')
          AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
          AND r.start_at < (d.d + INTERVAL '1 day')
          AND r.end_at   > d.d::TIMESTAMPTZ
      ) ev(t, delta)
    ) sweep ON true
    GROUP BY d.d
  )
  SELECT
    peak.d AS day,
    GREATEST((i.total_quantity - peak.peak_qty)::INT, 0) AS available
  FROM peak
  CROSS JOIN item_info i
  ORDER BY peak.d;
$$;
