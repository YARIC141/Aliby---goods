-- ============================================================
-- Миграция 4: Индексы для производительности
-- ============================================================

-- ---- stores ------------------------------------------------
CREATE INDEX idx_stores_name_trgm
  ON public.stores USING gin(name gin_trgm_ops);

-- ---- categories --------------------------------------------
CREATE INDEX idx_categories_store_id
  ON public.categories(store_id);

-- ---- menu_items --------------------------------------------
CREATE INDEX idx_menu_items_store_id
  ON public.menu_items(store_id);

CREATE INDEX idx_menu_items_category_id
  ON public.menu_items(category_id);

CREATE INDEX idx_menu_items_is_available
  ON public.menu_items(is_available);

CREATE INDEX idx_menu_items_price
  ON public.menu_items(price);

-- Полнотекстовый поиск по названию блюда
CREATE INDEX idx_menu_items_name_trgm
  ON public.menu_items USING gin(name gin_trgm_ops);

-- Составной: фильтрация по заведению + доступность (частый запрос)
CREATE INDEX idx_menu_items_store_available
  ON public.menu_items(store_id, is_available);

-- ---- subscriptions -----------------------------------------
CREATE INDEX idx_subscriptions_store_id
  ON public.subscriptions(store_id);

-- ---- user_subscriptions ------------------------------------
CREATE INDEX idx_user_subscriptions_user_id
  ON public.user_subscriptions(user_id);

CREATE INDEX idx_user_subscriptions_subscription_id
  ON public.user_subscriptions(subscription_id);

CREATE INDEX idx_user_subscriptions_status
  ON public.user_subscriptions(status);

-- Активные абонементы конкретного пользователя (UC9, UC13)
CREATE INDEX idx_user_subscriptions_user_status
  ON public.user_subscriptions(user_id, status);

-- ---- orders ------------------------------------------------
CREATE INDEX idx_orders_user_id
  ON public.orders(user_id);

CREATE INDEX idx_orders_store_id
  ON public.orders(store_id);

CREATE INDEX idx_orders_status
  ON public.orders(status);

CREATE INDEX idx_orders_order_time
  ON public.orders(order_time DESC);

-- Заказы заведения по статусу (UC18 — очередь заведения)
CREATE INDEX idx_orders_store_status
  ON public.orders(store_id, status);

-- ---- order_items -------------------------------------------
CREATE INDEX idx_order_items_order_id
  ON public.order_items(order_id);

CREATE INDEX idx_order_items_menu_item_id
  ON public.order_items(menu_item_id);

-- ---- subscription_redemptions ------------------------------
CREATE INDEX idx_redemptions_user_subscription_id
  ON public.subscription_redemptions(user_subscription_id);

CREATE INDEX idx_redemptions_order_id
  ON public.subscription_redemptions(order_id);

CREATE INDEX idx_redemptions_redeemed_at
  ON public.subscription_redemptions(redeemed_at DESC);

-- ---- payments ----------------------------------------------
CREATE INDEX idx_payments_order_id
  ON public.payments(order_id);

CREATE INDEX idx_payments_user_subscription_id
  ON public.payments(user_subscription_id);

CREATE INDEX idx_payments_status
  ON public.payments(status);
