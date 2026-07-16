-- ============================================================
-- Alliby Carry (2/3): схема диспетчеризации курьеров
-- ============================================================

-- 1. Режим доставки заведения. 'manual' по умолчанию — существующие заведения
-- не затрагиваются, сегодняшний ручной флоу (админ сам вписывает courier_phone)
-- продолжает работать без изменений.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS delivery_courier_mode    TEXT NOT NULL DEFAULT 'manual'
    CHECK (delivery_courier_mode IN ('manual', 'own_courier', 'carry')),
  ADD COLUMN IF NOT EXISTS delivery_carry_bid_mode  TEXT
    CHECK (delivery_carry_bid_mode IN ('auction', 'first_found')),
  ADD COLUMN IF NOT EXISTS delivery_search_radius_m INTEGER
    CHECK (delivery_search_radius_m > 0);

-- 2. "Свой курьер" — курируемый список заведения (own_courier режим).
CREATE TABLE IF NOT EXISTS public.store_couriers (
  store_id    UUID NOT NULL REFERENCES public.stores(id)   ON DELETE CASCADE,
  courier_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, courier_id)
);

ALTER TABLE public.store_couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_couriers: manage by store owner/employee/platform"
  ON public.store_couriers FOR ALL
  USING (
    public.is_platform_owner()
    OR public.is_store_owner_of(store_id)
    OR public.is_employee_of(store_id)
  )
  WITH CHECK (
    public.is_platform_owner()
    OR public.is_store_owner_of(store_id)
    OR public.is_employee_of(store_id)
  );

CREATE POLICY "store_couriers: courier sees own listings"
  ON public.store_couriers FOR SELECT
  USING (courier_id = auth.uid());

-- 3. Журнал отказов — исключает уже отказавшихся курьеров при повторном подборе
-- на тот же заказ (courier_decline_order, следующая миграция).
CREATE TABLE IF NOT EXISTS public.order_courier_declines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id)   ON DELETE CASCADE,
  courier_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  declined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, courier_id)
);

ALTER TABLE public.order_courier_declines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_courier_declines: select store or platform"
  ON public.order_courier_declines FOR SELECT
  USING (
    public.is_platform_owner()
    OR courier_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_courier_declines.order_id
        AND (public.is_store_owner_of(o.store_id) OR public.is_employee_of(o.store_id))
    )
  );

-- 4. Назначение курьера на заказ. Новых значений orders.status не вводится —
-- всё держится на существующих looking_for_courier/on_the_way, поэтому
-- client/admin UI не требует изменений: courier_phone просто заполняется
-- автоматически вместо ручного ввода админом.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carry_courier_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS carry_courier_reward       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS carry_dispatch_status      TEXT NOT NULL DEFAULT 'none'
    CHECK (carry_dispatch_status IN ('none', 'assigned', 'no_couriers_found')),
  ADD COLUMN IF NOT EXISTS carry_dispatched_at        TIMESTAMPTZ,
  -- Замораживают настройки заведения на момент первого запуска подбора для этого
  -- заказа, чтобы смена режима заведением посреди дела не меняла правила
  -- уже идущего/переигрываемого (после отказа) подбора.
  ADD COLUMN IF NOT EXISTS carry_mode_snapshot        TEXT
    CHECK (carry_mode_snapshot IN ('own_courier', 'carry')),
  ADD COLUMN IF NOT EXISTS carry_bid_mode_snapshot    TEXT
    CHECK (carry_bid_mode_snapshot IN ('auction', 'first_found')),
  ADD COLUMN IF NOT EXISTS carry_search_radius_used_m INTEGER;

CREATE INDEX IF NOT EXISTS idx_orders_carry_courier_id ON public.orders(carry_courier_id);

-- 5. Расстояние между двумя точками (метры) — без PostGIS, обычная haversine-формула
-- (порт уже существующей JS-версии в client/index.html). При масштабе "десятки
-- курьеров в городе" полный скан с сортировкой по расстоянию быстрый, индекс не нужен.
CREATE OR REPLACE FUNCTION public.haversine_m(
  lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT 6371000 * 2 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2 +
    cos(radians(lat1)) * cos(radians(lat2)) *
    sin(radians(lng2 - lng1) / 2) ^ 2
  ));
$$;
