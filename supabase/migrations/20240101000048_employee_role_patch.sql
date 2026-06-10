-- Патч: исправление политик, пропущенных в основной миграции

-- subscription_redemptions — нет колонки store_id, идём через join
DROP POLICY IF EXISTS "subscription_redemptions: select own or admin" ON public.subscription_redemptions;
DROP POLICY IF EXISTS "subscription_redemptions: select own or admin or employee" ON public.subscription_redemptions;
CREATE POLICY "subscription_redemptions: select own or admin or employee"
  ON public.subscription_redemptions FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.id = subscription_redemptions.user_subscription_id
        AND us.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      JOIN public.subscriptions s ON s.id = us.subscription_id
      WHERE us.id = subscription_redemptions.user_subscription_id
        AND public.is_employee_of(s.store_id)
    )
  );

DROP POLICY IF EXISTS "subscription_redemptions: admin insert" ON public.subscription_redemptions;
DROP POLICY IF EXISTS "subscription_redemptions: admin or employee insert" ON public.subscription_redemptions;
CREATE POLICY "subscription_redemptions: admin or employee insert"
  ON public.subscription_redemptions FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      JOIN public.subscriptions s ON s.id = us.subscription_id
      WHERE us.id = subscription_redemptions.user_subscription_id
        AND public.is_employee_of(s.store_id)
    )
  );

-- bookings принадлежит supabase_admin — переключаем роль
SET ROLE supabase_admin;

DROP POLICY IF EXISTS "bookings: select" ON public.bookings;
CREATE POLICY "bookings: select"
  ON public.bookings FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR public.is_employee_of(store_id)
  );

DROP POLICY IF EXISTS "bookings: employee update" ON public.bookings;
CREATE POLICY "bookings: employee update"
  ON public.bookings FOR UPDATE
  USING (public.is_admin() OR public.is_employee_of(store_id))
  WITH CHECK (public.is_admin() OR public.is_employee_of(store_id));

RESET ROLE;
