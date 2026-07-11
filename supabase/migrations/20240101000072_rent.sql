-- Migration 072: Rental feature
-- Adds rental capability to menu items with per-period pricing,
-- inventory tracking (denormalized quantity_available), and reservations table.

-- ── 1. Extend menu_items with rent fields ────────────────────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_rent            BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rent_period_unit   TEXT
    CHECK (rent_period_unit IN ('minute','hour','day','week','month')),
  ADD COLUMN IF NOT EXISTS rent_period_step   INT           CHECK (rent_period_step > 0),
  ADD COLUMN IF NOT EXISTS total_quantity     INT           CHECK (total_quantity > 0),
  ADD COLUMN IF NOT EXISTS quantity_available INT           CHECK (quantity_available >= 0);

-- ── 2. rent_reservations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rent_reservations (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID          NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  store_id    UUID          NOT NULL REFERENCES public.stores(id)     ON DELETE CASCADE,
  user_id     UUID          NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  start_at    TIMESTAMPTZ   NOT NULL,
  end_at      TIMESTAMPTZ   NOT NULL,
  quantity    INT           NOT NULL CHECK (quantity > 0),
  status      TEXT          NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','active','completed','cancelled')),
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
  notes       TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_rent_res_item   ON public.rent_reservations(item_id);
CREATE INDEX IF NOT EXISTS idx_rent_res_store  ON public.rent_reservations(store_id);
CREATE INDEX IF NOT EXISTS idx_rent_res_user   ON public.rent_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_rent_res_period ON public.rent_reservations(item_id, start_at, end_at);

-- ── 3. Trigger: maintain quantity_available on reservations changes ───────────
CREATE OR REPLACE FUNCTION public.rent_reservation_stock_trigger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('pending', 'active') THEN
      UPDATE public.menu_items
        SET quantity_available = quantity_available - NEW.quantity
        WHERE id = NEW.item_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Transition out of active/pending → release stock
    IF OLD.status IN ('pending', 'active') AND NEW.status IN ('completed', 'cancelled') THEN
      UPDATE public.menu_items
        SET quantity_available = quantity_available + OLD.quantity
        WHERE id = NEW.item_id;
    -- Transition into active/pending ← consume stock (edge case)
    ELSIF OLD.status IN ('completed', 'cancelled') AND NEW.status IN ('pending', 'active') THEN
      UPDATE public.menu_items
        SET quantity_available = quantity_available - NEW.quantity
        WHERE id = NEW.item_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('pending', 'active') THEN
      UPDATE public.menu_items
        SET quantity_available = quantity_available + OLD.quantity
        WHERE id = OLD.item_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS rent_reservation_stock ON public.rent_reservations;
CREATE TRIGGER rent_reservation_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.rent_reservations
  FOR EACH ROW EXECUTE FUNCTION public.rent_reservation_stock_trigger();

-- ── 4. RPC: available quantity for a specific time period ────────────────────
-- Used before adding to cart to confirm availability
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
    AND r.start_at < p_end
    AND r.end_at   > p_start
  WHERE mi.id = p_item_id
  GROUP BY mi.total_quantity;
$$;

-- ── 5. RPC: day-by-day availability for calendar rendering ───────────────────
-- Returns each day of the month with how many units are available.
-- Client filters days where available >= requested quantity.
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

GRANT EXECUTE ON FUNCTION public.get_rent_availability      TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_rent_days_availability TO authenticated, anon;

-- ── 6. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.rent_reservations ENABLE ROW LEVEL SECURITY;

-- Client sees own; admin sees all; employee sees store's
CREATE POLICY "rent_reservations: select"
  ON public.rent_reservations FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR public.is_employee_of(store_id)
  );

-- Client creates reservation
CREATE POLICY "rent_reservations: user insert"
  ON public.rent_reservations FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Admin or employee changes status (active / completed)
CREATE POLICY "rent_reservations: admin or employee update"
  ON public.rent_reservations FOR UPDATE
  USING  (public.is_admin() OR public.is_employee_of(store_id))
  WITH CHECK (public.is_admin() OR public.is_employee_of(store_id));

-- Client can cancel their own pending reservation
CREATE POLICY "rent_reservations: user cancel"
  ON public.rent_reservations FOR UPDATE
  USING  (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'cancelled');
