-- Migration 077: Fix integer cast in get_rent_slots_availability
-- p_step_min::TEXT is required for string concatenation in PostgreSQL.

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
    AND r.start_at < sl.s_end
    AND r.end_at   > sl.s_start
  GROUP BY sl.s_time, sl.s_start, i.total_quantity
  ORDER BY sl.s_start;
$$;

GRANT EXECUTE ON FUNCTION public.get_rent_slots_availability TO authenticated, anon;
