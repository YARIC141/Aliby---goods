-- Migration 131: Rent availability RPCs must convert wall-clock times using
-- the store's own timezone, not the DB session's default (UTC)
--
-- get_rent_slots_availability builds slot boundaries from p_date/p_open/p_close
-- (plain "HH:MI" strings meant to represent the store's LOCAL wall-clock hours)
-- by casting a naive TIMESTAMP straight to TIMESTAMPTZ. That cast interprets
-- the naive value using the Postgres session's timezone, which on this server
-- is UTC — not the store's actual timezone (stores.timezone, 'Europe/Moscow'
-- for every store today). So a slot labeled "10:00" was actually being
-- compared as 10:00 UTC (= 13:00 Moscow) against reservations, whose
-- start_at/end_at are correctly-converted true UTC instants sent by the
-- client for a real 10:00 Moscow booking (07:00 UTC). The 3-hour mismatch
-- meant the overlap check `r.start_at < sl.s_end AND r.end_at > sl.s_start`
-- compared against the wrong window and silently missed real conflicts —
-- an occupied slot could be shown as available because the RPC was actually
-- checking a completely different hour than the one displayed.
--
-- get_rent_days_availability has the same bug at day boundaries (`d.d::TIMESTAMPTZ`
-- treats local midnight as UTC midnight), which can misattribute reservations
-- near midnight to the wrong calendar day.
--
-- Fix: resolve each item's store timezone and use `naive_timestamp AT TIME ZONE
-- store_tz` (which correctly localizes a wall-clock value to a true instant)
-- instead of a bare cast, for both slot windows and day boundaries.

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
  WITH item_info AS (
    SELECT
      COALESCE(mi.total_quantity, 1) AS total_quantity,
      COALESCE(s.timezone, 'Europe/Moscow') AS tz
    FROM public.menu_items mi
    JOIN public.stores s ON s.id = mi.store_id
    WHERE mi.id = p_item_id
  ),
  slots AS (
    SELECT
      to_char(gs, 'HH24:MI') AS s_time,
      gs                                             AS s_start_naive,
      gs + make_interval(mins := p_step_min)         AS s_end_naive
    FROM generate_series(
      (p_date::TEXT || ' ' || p_open )::TIMESTAMP,
      (p_date::TEXT || ' ' || p_close)::TIMESTAMP - make_interval(mins := p_step_min),
      make_interval(mins := p_step_min)
    ) AS gs
  )
  SELECT
    sl.s_time AS slot_time,
    GREATEST((i.total_quantity - COALESCE(SUM(r.quantity), 0))::INT, 0) AS available
  FROM slots sl
  CROSS JOIN item_info i
  LEFT JOIN public.rent_reservations r
    ON  r.item_id = p_item_id
    AND r.status  IN ('pending', 'active')
    AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
    AND r.start_at < (sl.s_end_naive   AT TIME ZONE i.tz)
    AND r.end_at   > (sl.s_start_naive AT TIME ZONE i.tz)
  GROUP BY sl.s_time, sl.s_start_naive, i.tz, i.total_quantity
  ORDER BY sl.s_start_naive;
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
    SELECT
      mi.total_quantity,
      mi.rent_period_unit,
      COALESCE(s.timezone, 'Europe/Moscow') AS tz
    FROM public.menu_items mi
    JOIN public.stores s ON s.id = mi.store_id
    WHERE mi.id = p_item_id
  ),
  baselines AS (
    -- quantity already reserved and active at the exact (store-local) start of the day
    SELECT
      d.d,
      COALESCE((
        SELECT SUM(r.quantity)
        FROM public.rent_reservations r, item_info i
        WHERE r.item_id = p_item_id
          AND r.status IN ('pending', 'active')
          AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
          AND r.start_at <= (d.d::TIMESTAMP AT TIME ZONE i.tz)
          AND r.end_at   >  (d.d::TIMESTAMP AT TIME ZONE i.tz)
      ), 0)::INT AS baseline
    FROM days d
  ),
  levels AS (
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
        FROM public.rent_reservations r, item_info i
        WHERE r.item_id = p_item_id
          AND r.status IN ('pending', 'active')
          AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
          AND r.start_at >= (b.d::TIMESTAMP                     AT TIME ZONE i.tz)
          AND r.start_at <  ((b.d + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE i.tz)
        UNION ALL
        SELECT r.end_at, -r.quantity
        FROM public.rent_reservations r, item_info i
        WHERE r.item_id = p_item_id
          AND r.status IN ('pending', 'active')
          AND (r.payment_status = 'paid' OR r.created_at > now() - INTERVAL '20 minutes')
          AND r.end_at >  (b.d::TIMESTAMP                     AT TIME ZONE i.tz)
          AND r.end_at <= ((b.d + INTERVAL '1 day')::TIMESTAMP AT TIME ZONE i.tz)
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
