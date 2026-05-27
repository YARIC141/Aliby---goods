-- Add in_progress status and estimated_ready_at to orders
ALTER TABLE public.orders
  DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
    CHECK (status = ANY (ARRAY['pending','paid','in_progress','ready','issued','cancelled']));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.orders.estimated_ready_at IS 'Admin-set estimated pickup time; set when transitioning to in_progress';
