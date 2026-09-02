-- Migration 127: Ignore stale unpaid rent reservations in availability checks
--
-- get_rent_availability / get_rent_days_availability / get_rent_slots_availability
-- count every reservation with status IN ('pending','active') regardless of
-- payment_status or age. A reservation is created with status='pending' the
-- moment the user taps "Забронировать"/"Оплатить" (rentBookNow/rentPayNow),
-- before payment completes — if the user abandons checkout (closes the app,
-- payment fails, etc.) that row is never cancelled or cleaned up, so it goes
-- on holding stock forever. For low-total_quantity items and wide date
-- ranges (day/week/month rentals) a handful of abandoned attempts is enough
-- to exhaust total_quantity and make every day in the calendar show as
-- unavailable, even though nobody actually completed a rental.
--
-- Fix: an unpaid pending reservation only holds its slot for a short grace
-- window (20 minutes) after creation, long enough to cover a live checkout —
-- past that, if it was never paid, it stops counting against availability.
-- Paid reservations (and 'active' ones) always count, regardless of age.

CREATE OR REPLACE FUNCTION public.get_rent_availability(
  p_item_id UUID,
  p_start   TIMESTAMPTZ,
  p_end     TIMESTAMPTZ
)
RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    (mi.total_quantity - COALESCE(SUM(r.quantity), 0))::INT,
    0
  )
  FROM public.menu_items mi
  LEFT JOIN public.rent_reservations r
    ON r.item_id = mi.id
    AND r.status IN ('pending', 'active')
    AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
    AND r.start_at < p_end
    AND r.end_at   > p_start
  WHERE mi.id = p_item_id
  GROUP BY mi.total_quantity;
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
  reserved AS (
    SELECT
      d.d,
      COALESCE(SUM(r.quantity), 0) AS reserved_qty
    FROM days d
    LEFT JOIN public.rent_reservations r
      ON r.item_id = p_item_id
      AND r.status IN ('pending', 'active')
      AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
      AND r.start_at < (d.d + INTERVAL '1 day')
      AND r.end_at   > d.d::TIMESTAMPTZ
    GROUP BY d.d
  )
  SELECT
    res.d AS day,
    GREATEST((i.total_quantity - res.reserved_qty)::INT, 0) AS available
  FROM reserved res
  CROSS JOIN item_info i
  ORDER BY res.d;
$$;

CREATE OR REPLACE FUNCTION public.get_rent_slots_availability(
  p_item_id  UUID,
  p_date     DATE,
  p_open     TEXT,
  p_close    TEXT,
  p_step_min INT
)
RETURNS TABLE(slot_time TEXT, available INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH slots AS (
    SELECT
      to_char(gs, 'HH24:MI') AS s_time,
      gs::TIMESTAMPTZ         AS s_start,
      (gs + make_interval(mins := p_step_min))::TIMESTAMPTZ AS s_end
    FROM generate_series(
      (p_date::TEXT || ' ' || p_open )::TIMESTAMP,
      (p_date::TEXT || ' ' || p_close)::TIMESTAMP - make_interval(mins := p_step_min),
      make_interval(mins := p_step_min)
    ) AS gs
  ),
  item_info AS (SELECT COALESCE(total_quantity, 1) AS total_quantity FROM public.menu_items WHERE id = p_item_id)
  SELECT
    sl.s_time AS slot_time,
    GREATEST(
      (i.total_quantity - COALESCE(SUM(r.quantity), 0))::INT,
      0
    ) AS available
  FROM slots sl
  CROSS JOIN item_info i
  LEFT JOIN public.rent_reservations r
    ON  r.item_id = p_item_id
    AND r.status  IN ('pending', 'active')
    AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
    AND r.start_at < sl.s_end
    AND r.end_at   > sl.s_start
  GROUP BY sl.s_time, sl.s_start, i.total_quantity
  ORDER BY sl.s_start;
$$;
