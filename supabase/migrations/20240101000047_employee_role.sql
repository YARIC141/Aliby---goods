-- ============================================================
-- Роль employee: сотрудники заведений
-- ============================================================

-- 1. Расширяем CHECK-ограничение на profiles.role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'employee'));

-- 2. Новые колонки для сотрудников
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employee_login     TEXT,
  ADD COLUMN IF NOT EXISTS employee_password  TEXT;

-- 3. Вспомогательные функции
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Возвращает store_id сотрудника (NULL если не сотрудник)
CREATE OR REPLACE FUNCTION public.employee_store()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT employee_store_id FROM public.profiles
  WHERE id = auth.uid() AND role = 'employee';
$$;

-- True если текущий пользователь — сотрудник данного заведения
CREATE OR REPLACE FUNCTION public.is_employee_of(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'employee' AND employee_store_id = p_store_id
  );
$$;

-- 4. Обновляем RLS политики для orders
DROP POLICY IF EXISTS "orders: select own or admin" ON public.orders;
CREATE POLICY "orders: select own or admin or employee"
  ON public.orders FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR public.is_employee_of(store_id)
  );

DROP POLICY IF EXISTS "orders: admin update" ON public.orders;
CREATE POLICY "orders: admin or employee update"
  ON public.orders FOR UPDATE
  USING (public.is_admin() OR public.is_employee_of(store_id))
  WITH CHECK (public.is_admin() OR public.is_employee_of(store_id));

-- 5. order_items — сотрудники видят позиции своих заказов
DROP POLICY IF EXISTS "order_items: select own or admin" ON public.order_items;
CREATE POLICY "order_items: select own or admin or employee"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.user_id = auth.uid() OR public.is_admin() OR public.is_employee_of(o.store_id))
    )
  );

-- 6. subscription_redemptions — сотрудники видят и создают списания
DROP POLICY IF EXISTS "subscription_redemptions: select own or admin" ON public.subscription_redemptions;
CREATE POLICY "subscription_redemptions: select own or admin or employee"
  ON public.subscription_redemptions FOR SELECT
  USING (
    public.is_admin()
    OR public.is_employee_of(store_id)
    OR EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.id = subscription_redemptions.user_subscription_id
        AND us.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subscription_redemptions: admin insert" ON public.subscription_redemptions;
CREATE POLICY "subscription_redemptions: admin or employee insert"
  ON public.subscription_redemptions FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_employee_of(store_id));

-- 7. user_subscriptions — сотрудники видят подписки своих клиентов (для QR)
DROP POLICY IF EXISTS "user_subscriptions: select own or admin" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions: select own or admin or employee"
  ON public.user_subscriptions FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = user_subscriptions.subscription_id
        AND public.is_employee_of(s.store_id)
    )
  );

-- 8. bookings — сотрудники видят и обновляют записи своего заведения
DROP POLICY IF EXISTS "bookings: select" ON public.bookings;
CREATE POLICY "bookings: select"
  ON public.bookings FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR public.is_employee_of(store_id)
  );

-- Сотрудники могут обновлять статус записей своего заведения
CREATE POLICY "bookings: employee update"
  ON public.bookings FOR UPDATE
  USING (public.is_admin() OR public.is_employee_of(store_id))
  WITH CHECK (public.is_admin() OR public.is_employee_of(store_id));

-- 9. Profiles: сотрудники видят только свой профиль (is_admin покрывает admin)
-- Существующая политика уже работает правильно: id = auth.uid() OR is_admin()
