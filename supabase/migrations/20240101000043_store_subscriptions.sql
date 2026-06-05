-- ────────────────────────────────────────────────────────────────────────────
-- Store visibility + per-store subscription model
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Store visibility flag (admin-controlled + auto-managed on sub expiry)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

-- 2. Link subscription to a specific store (NULL = main platform subscription)
ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS store_id   UUID    REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT true;

-- 3. Consent log for GDPR / dispute protection
CREATE TABLE IF NOT EXISTS public.subscription_consents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address   TEXT,
  user_agent   TEXT,
  consent_text TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consents_insert_service" ON public.subscription_consents
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "consents_select_owner" ON public.subscription_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 4. Store-limit logic:
--    • 1 store always free (no subscription needed)
--    • Main sub (store_id IS NULL, active/grace) allows 1 store with full features
--    • Each per-store sub (store_id IS NOT NULL) allows 1 more store
CREATE OR REPLACE FUNCTION public.user_store_limit(p_user_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  has_main BOOLEAN;
  extra    INTEGER;
BEGIN
  -- Always allow at least 1 free store
  SELECT EXISTS(
    SELECT 1 FROM public.platform_subscriptions
    WHERE user_id = p_user_id AND store_id IS NULL
      AND status IN ('active','grace') AND end_date >= CURRENT_DATE
  ) INTO has_main;

  IF NOT has_main THEN
    RETURN 1;   -- 1 free store without any subscription
  END IF;

  -- Main sub = 1 store; each active per-store sub = +1
  SELECT COUNT(*) INTO extra
  FROM public.platform_subscriptions
  WHERE user_id  = p_user_id
    AND store_id IS NOT NULL
    AND status   IN ('active','grace')
    AND end_date >= CURRENT_DATE;

  RETURN 1 + extra;
END;
$$;

-- 5. Auto-hide store when its per-store subscription expires or is cancelled
CREATE OR REPLACE FUNCTION public.sync_store_visibility()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only act on per-store subscriptions
  IF NEW.store_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status IN ('expired', 'cancelled') THEN
    UPDATE public.stores SET is_visible = false WHERE id = NEW.store_id;
  ELSIF NEW.status IN ('active', 'grace') THEN
    UPDATE public.stores SET is_visible = true  WHERE id = NEW.store_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_store_visibility ON public.platform_subscriptions;
CREATE TRIGGER trg_sync_store_visibility
  AFTER UPDATE OF status ON public.platform_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_store_visibility();

-- 6. RLS: store owner can update is_visible on their own stores
CREATE POLICY IF NOT EXISTS "stores_owner_update_visibility"
  ON public.stores FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
