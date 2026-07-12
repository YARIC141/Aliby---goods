-- Add delivery columns to orders (present in payment_intents but missing here)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_delivery      BOOLEAN       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;
