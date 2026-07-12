-- Migration 075: RPC for per-slot availability (minute/hour rentals)
-- Returns one row per time slot for a given day with available unit count.
-- p_open / p_close are 'HH:MM' strings (local working hours).
-- p_step_min is slot duration in minutes (= rent_period_step * unit_minutes).

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
      to_char((p_open::TIME + gs),  'HH24:MI') AS s_time,
      (p_date + p_open::TIME  + gs)::TIMESTAMPTZ AS s_start,
      (p_date + p_open::TIME  + gs + (p_step_min || ' minutes')::INTERVAL)::TIMESTAMPTZ AS s_end
    FROM generate_series(
      '0 minutes'::INTERVAL,
      (p_close::TIME - p_open::TIME - (p_step_min || ' minutes')::INTERVAL),
      (p_step_min || ' minutes')::INTERVAL
    ) gs
  ),
  item_info AS (SELECT total_quantity FROM public.menu_items WHERE id = p_item_id)
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
    AND r.start_at < sl.s_end
    AND r.end_at   > sl.s_start
  GROUP BY sl.s_time, sl.s_start, i.total_quantity
  ORDER BY sl.s_start;
$$;

GRANT EXECUTE ON FUNCTION public.get_rent_slots_availability TO authenticated, anon;
