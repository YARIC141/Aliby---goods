-- Migration 070: Masters feature
-- Adds is_master flag to employees, master schedules, master-service assignments,
-- duration_minutes to menu_items, and master_id to bookings.

-- ── 1. Service duration on menu_items ────────────────────────────────────────
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER CHECK (duration_minutes > 0);

-- ── 2. Master fields on profiles ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_master         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS master_bio        TEXT,
  ADD COLUMN IF NOT EXISTS master_photo_url  TEXT;

-- ── 3. master_id on bookings ─────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS master_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_master_date
  ON public.bookings (master_id, slot_date);

-- ── 4. master_services ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_services (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id  UUID        NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  service_id UUID        NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  price      NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (master_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_master_services_master
  ON public.master_services (master_id);
CREATE INDEX IF NOT EXISTS idx_master_services_service
  ON public.master_services (service_id);

ALTER TABLE public.master_services ENABLE ROW LEVEL SECURITY;

-- Клиенты и мастера читают для расчёта слотов и отображения цен
CREATE POLICY "master_services: public read"
  ON public.master_services FOR SELECT USING (true);

-- Только владелец заведения (через store.owner_user_id) или платформа
CREATE POLICY "master_services: owner insert"
  ON public.master_services FOR INSERT
  WITH CHECK (
    is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.stores s ON s.id = p.employee_store_id
      WHERE p.id = master_services.master_id
        AND s.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "master_services: owner update"
  ON public.master_services FOR UPDATE
  USING (
    is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.stores s ON s.id = p.employee_store_id
      WHERE p.id = master_services.master_id
        AND s.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "master_services: owner delete"
  ON public.master_services FOR DELETE
  USING (
    is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.stores s ON s.id = p.employee_store_id
      WHERE p.id = master_services.master_id
        AND s.owner_user_id = auth.uid()
    )
  );

-- ── 5. master_schedules ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_schedules (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id   UUID      NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME      NOT NULL,
  end_time    TIME      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (master_id, day_of_week),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_master_schedules_master
  ON public.master_schedules (master_id);

ALTER TABLE public.master_schedules ENABLE ROW LEVEL SECURITY;

-- Клиенты читают для расчёта доступных слотов
CREATE POLICY "master_schedules: public read"
  ON public.master_schedules FOR SELECT USING (true);

CREATE POLICY "master_schedules: owner insert"
  ON public.master_schedules FOR INSERT
  WITH CHECK (
    is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.stores s ON s.id = p.employee_store_id
      WHERE p.id = master_schedules.master_id
        AND s.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "master_schedules: owner update"
  ON public.master_schedules FOR UPDATE
  USING (
    is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.stores s ON s.id = p.employee_store_id
      WHERE p.id = master_schedules.master_id
        AND s.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "master_schedules: owner delete"
  ON public.master_schedules FOR DELETE
  USING (
    is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.stores s ON s.id = p.employee_store_id
      WHERE p.id = master_schedules.master_id
        AND s.owner_user_id = auth.uid()
    )
  );
