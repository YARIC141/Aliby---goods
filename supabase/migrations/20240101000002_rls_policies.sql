-- ============================================================
-- Миграция 2: Row Level Security (RLS) политики
-- ============================================================

-- Включаем RLS на всех таблицах
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments              ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Вспомогательная функция: проверка роли admin
-- SECURITY DEFINER — запускается с правами владельца (postgres),
-- что позволяет обойти RLS при чтении profiles изнутри функции
-- и избежать рекурсии.
-- ============================================================
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

-- ============================================================
-- PROFILES
-- ============================================================

-- Пользователь видит только свой профиль; админ — любой
CREATE POLICY "profiles: select own or admin"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

-- Пользователь может обновить только своё имя; роль менять нельзя
CREATE POLICY "profiles: update own name"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- Админ может обновить любой профиль (включая смену роли)
CREATE POLICY "profiles: admin full update"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- INSERT создаётся только триггером handle_new_user (SECURITY DEFINER),
-- прямая запись через API запрещена — отдельная политика не нужна.

-- ============================================================
-- STORES — публичное чтение, запись только для admin
-- ============================================================

CREATE POLICY "stores: public select"
  ON public.stores FOR SELECT
  USING (true);

CREATE POLICY "stores: admin insert"
  ON public.stores FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "stores: admin update"
  ON public.stores FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "stores: admin delete"
  ON public.stores FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- CATEGORIES — публичное чтение, запись только для admin
-- ============================================================

CREATE POLICY "categories: public select"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "categories: admin insert"
  ON public.categories FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "categories: admin update"
  ON public.categories FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "categories: admin delete"
  ON public.categories FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- MENU_ITEMS — публичное чтение, запись только для admin
-- ============================================================

CREATE POLICY "menu_items: public select"
  ON public.menu_items FOR SELECT
  USING (true);

CREATE POLICY "menu_items: admin insert"
  ON public.menu_items FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "menu_items: admin update"
  ON public.menu_items FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "menu_items: admin delete"
  ON public.menu_items FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- SUBSCRIPTIONS — публичное чтение, запись только для admin
-- ============================================================

CREATE POLICY "subscriptions: public select"
  ON public.subscriptions FOR SELECT
  USING (true);

CREATE POLICY "subscriptions: admin insert"
  ON public.subscriptions FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "subscriptions: admin update"
  ON public.subscriptions FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "subscriptions: admin delete"
  ON public.subscriptions FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- USER_SUBSCRIPTIONS
-- Создание и активация — только через Edge Function payment-webhook
-- (service_role обходит RLS). Прямая запись через REST API запрещена.
-- ============================================================

CREATE POLICY "user_subscriptions: select own or admin"
  ON public.user_subscriptions FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================
-- ORDERS
-- ============================================================

CREATE POLICY "orders: select own or admin"
  ON public.orders FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Пользователь создаёт заказ от своего имени
CREATE POLICY "orders: user insert"
  ON public.orders FOR INSERT
  WITH CHECK (user_id = auth.uid() AND auth.uid() IS NOT NULL);

-- Админ меняет статус заказа (ready / issued)
CREATE POLICY "orders: admin update"
  ON public.orders FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- ORDER_ITEMS
-- ============================================================

CREATE POLICY "order_items: select own or admin"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.user_id = auth.uid() OR public.is_admin())
    )
  );

-- Позиции добавляются только к pending-заказу текущего пользователя
CREATE POLICY "order_items: user insert"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
        AND o.status = 'pending'
    )
  );

-- ============================================================
-- SUBSCRIPTION_REDEMPTIONS
-- Создаётся только через Edge Function redeem-subscription (service_role)
-- ============================================================

CREATE POLICY "subscription_redemptions: select own or admin"
  ON public.subscription_redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE us.id = subscription_redemptions.user_subscription_id
        AND (us.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ============================================================
-- PAYMENTS
-- Создаются и обновляются только через Edge Functions (service_role)
-- ============================================================

CREATE POLICY "payments: select own or admin"
  ON public.payments FOR SELECT
  USING (
    (
      order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = payments.order_id
          AND (o.user_id = auth.uid() OR public.is_admin())
      )
    ) OR (
      user_subscription_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_subscriptions us
        WHERE us.id = payments.user_subscription_id
          AND (us.user_id = auth.uid() OR public.is_admin())
      )
    )
  );
