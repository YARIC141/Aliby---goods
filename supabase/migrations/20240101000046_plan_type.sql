-- Distinguish platform (main) subscriptions from per-store subscriptions
ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'platform'
  CHECK (plan_type IN ('platform', 'store'));

-- Mark existing per-store subscriptions (have a linked store)
UPDATE public.platform_subscriptions
SET plan_type = 'store'
WHERE store_id IS NOT NULL;

-- user_store_limit: count per-store subs by plan_type regardless of store_id
-- (unlinked slots count too so limit is enforced before store is created)
CREATE OR REPLACE FUNCTION public.user_store_limit(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  has_main BOOLEAN;
  extra    INTEGER;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.platform_subscriptions
    WHERE user_id   = p_user_id
      AND plan_type = 'platform'
      AND status    IN ('active','grace')
      AND end_date  >= CURRENT_DATE
  ) INTO has_main;

  IF NOT has_main THEN
    RETURN 1;  -- 1 free store without subscription
  END IF;

  SELECT COUNT(*) INTO extra
  FROM public.platform_subscriptions
  WHERE user_id   = p_user_id
    AND plan_type = 'store'
    AND status    IN ('active','grace')
    AND end_date  >= CURRENT_DATE;

  RETURN 1 + extra;
END;
$$;

-- is_store_subscription_active: only platform plan enables cart/delivery
CREATE OR REPLACE FUNCTION public.is_store_subscription_active(p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_subscriptions ps
    JOIN public.stores s ON s.owner_user_id = ps.user_id
    WHERE s.id       = p_store_id
      AND ps.plan_type = 'platform'
      AND ps.status  IN ('active', 'grace')
      AND ps.end_date >= CURRENT_DATE
  );
$$;

-- get_active_sub_owner_ids: only platform plan enables cart/delivery
CREATE OR REPLACE FUNCTION public.get_active_sub_owner_ids()
RETURNS TABLE(user_id UUID) LANGUAGE sql SECURITY DEFINER STABLE AS $f$
  SELECT DISTINCT user_id
  FROM public.platform_subscriptions
  WHERE plan_type = 'platform'
    AND status    IN ('active', 'grace')
    AND end_date  >= CURRENT_DATE;
$f$;

-- sync_store_visibility: only fire for store-type subscriptions
CREATE OR REPLACE FUNCTION public.sync_store_visibility()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.plan_type != 'store' THEN RETURN NEW; END IF;
  IF NEW.store_id IS NULL     THEN RETURN NEW; END IF;

  IF NEW.status IN ('expired', 'cancelled') THEN
    UPDATE public.stores SET is_visible = false WHERE id = NEW.store_id;
  ELSIF NEW.status IN ('active', 'grace') THEN
    UPDATE public.stores SET is_visible = true  WHERE id = NEW.store_id;
  END IF;

  RETURN NEW;
END;
$$;
