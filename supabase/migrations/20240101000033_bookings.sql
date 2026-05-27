-- Bookings for services direction

CREATE TABLE IF NOT EXISTS public.bookings (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  store_id       UUID        NOT NULL REFERENCES public.stores(id)   ON DELETE CASCADE,
  menu_item_id   UUID        NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  slot_date      DATE        NOT NULL,
  slot_start     TIME        NOT NULL,
  slot_end       TIME        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'booked'
                             CHECK (status IN ('booked','cancelled','rescheduled')),
  payment_status TEXT        NOT NULL DEFAULT 'unpaid'
                             CHECK (payment_status IN ('unpaid','paid')),
  total_price    NUMERIC(10,2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id    ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_store_date ON public.bookings(store_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_bookings_slot_date  ON public.bookings(slot_date);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Users see their own bookings; store owners see bookings for their stores
CREATE POLICY "bookings: select"
  ON public.bookings FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_user_id = auth.uid())
  );

CREATE POLICY "bookings: user insert"
  ON public.bookings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "bookings: user update"
  ON public.bookings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
