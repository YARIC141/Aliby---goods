-- Add recurring-subscription columns to platform_subscriptions
ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS rebill_id              TEXT,
  ADD COLUMN IF NOT EXISTS extra_stores           INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_amount_kopecks INTEGER     NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS retry_count            INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grace_until            DATE,
  ADD COLUMN IF NOT EXISTS is_trial               BOOLEAN     NOT NULL DEFAULT false;

-- Extend status set to include 'grace'
ALTER TABLE public.platform_subscriptions
  DROP CONSTRAINT IF EXISTS platform_subscriptions_status_check;
ALTER TABLE public.platform_subscriptions
  ADD CONSTRAINT platform_subscriptions_status_check
  CHECK (status IN ('pending','active','grace','cancelled','expired','failed'));

-- Update subscription-active check to accept 'grace' status as well
CREATE OR REPLACE FUNCTION public.is_store_subscription_active(p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_subscriptions ps
    JOIN public.stores s ON s.owner_user_id = ps.user_id
    WHERE s.id = p_store_id
      AND ps.status IN ('active', 'grace')
      AND ps.end_date >= CURRENT_DATE
  );
$$;

-- How many stores a user is allowed (1 base + extra_stores from active/grace sub)
CREATE OR REPLACE FUNCTION public.user_store_limit(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT 1 + extra_stores
     FROM public.platform_subscriptions
     WHERE user_id    = p_user_id
       AND status     IN ('active', 'grace')
       AND end_date   >= CURRENT_DATE
     ORDER BY end_date DESC LIMIT 1),
    0  -- no active subscription → no stores allowed to add
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_store_limit(UUID) TO authenticated, service_role;

-- Store-limit enforcement trigger (replaces client-side check)
CREATE OR REPLACE FUNCTION public.check_store_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_allowed INTEGER;
  v_current INTEGER;
BEGIN
  v_allowed := public.user_store_limit(NEW.owner_user_id);
  SELECT COUNT(*) INTO v_current
  FROM public.stores WHERE owner_user_id = NEW.owner_user_id;
  IF v_current >= v_allowed THEN
    RAISE EXCEPTION 'store_limit_reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_limit ON public.stores;
CREATE TRIGGER trg_store_limit
  BEFORE INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.check_store_limit();
