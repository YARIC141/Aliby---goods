-- Migration 055: full owner isolation
-- Replace generic is_admin() in all RLS policies with owner-specific checks.
-- Platform owner (yarich92@gmail.com) retains access to all data.
-- Each admin sees/manages only their own stores' data.
-- Employees see only data belonging to their assigned store.

-- ── HELPER FUNCTIONS ──────────────────────────────────────────

-- True if current user is the platform owner
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND email = 'yarich92@gmail.com'
  );
$$;

-- True if current user owns the given store
CREATE OR REPLACE FUNCTION public.is_store_owner_of(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND owner_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_owner()     TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_store_owner_of(UUID) TO authenticated, anon;

-- ── ORDERS ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "orders: select own or admin or employee" ON public.orders;
CREATE POLICY "orders: select own or admin or employee"
  ON public.orders FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_platform_owner()
    OR public.is_store_owner_of(store_id)
    OR public.is_employee_of(store_id)
  );

DROP POLICY IF EXISTS "orders: admin or employee update" ON public.orders;
CREATE POLICY "orders: admin or employee update"
  ON public.orders FOR UPDATE
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

-- ── ORDER ITEMS ───────────────────────────────────────────────

DROP POLICY IF EXISTS "order_items: select own or admin or employee" ON public.order_items;
CREATE POLICY "order_items: select own or admin or employee"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          o.user_id = auth.uid()
          OR public.is_platform_owner()
          OR public.is_store_owner_of(o.store_id)
          OR public.is_employee_of(o.store_id)
        )
    )
  );

-- ── SUBSCRIPTION REDEMPTIONS ──────────────────────────────────
-- Note: subscription_redemptions has no store_id column.
-- Access is determined via user_subscriptions -> subscriptions -> store_id.

DROP POLICY IF EXISTS "subscription_redemptions: select own or admin or employee" ON public.subscription_redemptions;
CREATE POLICY "subscription_redemptions: select own or admin or employee"
  ON public.subscription_redemptions FOR SELECT
  USING (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      JOIN public.subscriptions s ON s.id = us.subscription_id
      WHERE us.id = subscription_redemptions.user_subscription_id
        AND (
          us.user_id = auth.uid()
          OR public.is_store_owner_of(s.store_id)
          OR public.is_employee_of(s.store_id)
        )
    )
  );

DROP POLICY IF EXISTS "subscription_redemptions: admin or employee insert" ON public.subscription_redemptions;
CREATE POLICY "subscription_redemptions: admin or employee insert"
  ON public.subscription_redemptions FOR INSERT
  WITH CHECK (
    public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      JOIN public.subscriptions s ON s.id = us.subscription_id
      WHERE us.id = subscription_redemptions.user_subscription_id
        AND (
          public.is_store_owner_of(s.store_id)
          OR public.is_employee_of(s.store_id)
        )
    )
  );

-- ── USER SUBSCRIPTIONS ────────────────────────────────────────

DROP POLICY IF EXISTS "user_subscriptions: select own or admin or employee" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions: select own or admin or employee"
  ON public.user_subscriptions FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = user_subscriptions.subscription_id
        AND (
          public.is_store_owner_of(s.store_id)
          OR public.is_employee_of(s.store_id)
        )
    )
  );

-- ── BOOKINGS (owned by supabase_admin — apply as that role) ──

SET ROLE supabase_admin;

DROP POLICY IF EXISTS "bookings: select" ON public.bookings;
CREATE POLICY "bookings: select"
  ON public.bookings FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_platform_owner()
    OR public.is_store_owner_of(store_id)
    OR public.is_employee_of(store_id)
  );

DROP POLICY IF EXISTS "bookings: employee update" ON public.bookings;
CREATE POLICY "bookings: admin or employee update"
  ON public.bookings FOR UPDATE
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

RESET ROLE;

-- ── PROFILES ─────────────────────────────────────────────────

-- SELECT: own profile, platform owner, or admin seeing their employees
DROP POLICY IF EXISTS "profiles: select own or admin" ON public.profiles;
CREATE POLICY "profiles: select own or admin"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.owner_user_id = auth.uid()
        AND profiles.employee_store_id = s.id
    )
  );

-- UPDATE by admin: platform owner, own profile, or own employees
DROP POLICY IF EXISTS "profiles: admin full update" ON public.profiles;
CREATE POLICY "profiles: admin full update"
  ON public.profiles FOR UPDATE
  USING (
    public.is_platform_owner()
    OR id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.owner_user_id = auth.uid()
        AND profiles.employee_store_id = s.id
    )
  );

-- ── PLATFORM SUBSCRIPTIONS ────────────────────────────────────

-- Billing data visible only to the subscriber themselves or platform owner
DROP POLICY IF EXISTS "platform_subs: select own or admin" ON public.platform_subscriptions;
CREATE POLICY "platform_subs: select own or admin"
  ON public.platform_subscriptions FOR SELECT
  USING (user_id = auth.uid() OR public.is_platform_owner());
