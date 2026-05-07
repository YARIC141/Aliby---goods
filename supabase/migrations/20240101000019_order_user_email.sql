-- Denormalise user email into orders for fast search without auth.users join
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Backfill existing rows
UPDATE public.orders o
SET user_email = au.email
FROM auth.users au
WHERE o.user_id = au.id;

-- Trigger: populate user_email automatically on every new order
CREATE OR REPLACE FUNCTION orders_set_user_email()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  SELECT email INTO NEW.user_email FROM auth.users WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_user_email
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION orders_set_user_email();

-- Trigram index for substring email search (pg_trgm already available in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_orders_user_email_trgm
  ON public.orders USING GIN (user_email gin_trgm_ops);
