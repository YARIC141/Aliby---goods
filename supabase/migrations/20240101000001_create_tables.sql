-- ============================================================
-- Миграция 1: Создание всех таблиц
-- ============================================================

-- Расширения
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- для полнотекстового поиска

-- ============================================================
-- profiles — расширение auth.users
-- ============================================================
CREATE TABLE public.profiles (
  id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role        TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  full_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.profiles.role IS 'user = клиент, admin = управляющий';

-- ============================================================
-- stores — заведения (кафе)
-- ============================================================
CREATE TABLE public.stores (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT             NOT NULL,
  address       TEXT             NOT NULL,
  latitude      DOUBLE PRECISION NOT NULL,
  longitude     DOUBLE PRECISION NOT NULL,
  phone         TEXT,
  working_hours TEXT,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- ============================================================
-- categories — категории меню
-- store_id = NULL означает глобальную категорию (для всех заведений)
-- ============================================================
CREATE TABLE public.categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  store_id   UUID        REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.categories.store_id IS 'NULL = глобальная категория для всех заведений';

-- ============================================================
-- menu_items — позиции меню
-- ============================================================
CREATE TABLE public.menu_items (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID         NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id  UUID         REFERENCES public.categories(id) ON DELETE SET NULL,
  name         TEXT         NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url    TEXT,
  is_available BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ============================================================
-- subscriptions — абонементы заведения (планы)
-- coverage_rules, time_rules, usage_limits хранятся как JSONB
-- ============================================================
CREATE TABLE public.subscriptions (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID          NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name           TEXT          NOT NULL,
  price          NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  duration_days  INTEGER       NOT NULL CHECK (duration_days > 0),
  total_uses     INTEGER       NOT NULL DEFAULT 0 CHECK (total_uses >= 0),
  -- 0 = безлимит
  coverage_rules JSONB         NOT NULL DEFAULT '{"type":"all"}',
  -- Структура: { "type": "all"|"include_categories"|"include_items"|"exclude_items",
  --              "category_ids": ["uuid"], "item_ids": ["uuid"], "exclude_items": ["uuid"] }
  time_rules     JSONB         NOT NULL DEFAULT '{"weekdays":[1,2,3,4,5,6,7]}',
  -- Структура: { "weekdays": [1-7], "time_start": "HH:MM", "time_end": "HH:MM",
  --              "excluded_dates": ["YYYY-MM-DD"] }
  usage_limits   JSONB         NOT NULL DEFAULT '{}',
  -- Структура: { "daily_limit": N, "min_interval_hours": N, "min_order_amount": N }
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- user_subscriptions — купленные абонементы пользователей
-- ============================================================
CREATE TABLE public.user_subscriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id  UUID        NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
  purchase_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
  start_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date         TIMESTAMPTZ,
  remaining_uses   INTEGER     CHECK (remaining_uses >= 0),
  -- NULL = безлимит (когда total_uses = 0)
  used_today       INTEGER     NOT NULL DEFAULT 0 CHECK (used_today >= 0),
  last_used_at     TIMESTAMPTZ,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'expired', 'cancelled'))
);

-- ============================================================
-- orders — заказы (только самовывоз)
-- ============================================================
CREATE TABLE public.orders (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  store_id                    UUID          NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  order_time                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  pickup_time                 TIMESTAMPTZ,
  status                      TEXT          NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'paid', 'ready', 'issued', 'cancelled')),
  total_amount                NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  payment_method              TEXT          CHECK (payment_method IN ('card', 'subscription', 'mixed')),
  subscription_discount       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (subscription_discount >= 0),
  applied_user_subscription_id UUID         REFERENCES public.user_subscriptions(id) ON DELETE SET NULL
);

-- ============================================================
-- order_items — позиции заказа
-- ============================================================
CREATE TABLE public.order_items (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id   UUID          NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  quantity       INTEGER       NOT NULL CHECK (quantity > 0),
  price_at_time  NUMERIC(10,2) NOT NULL CHECK (price_at_time >= 0)
);

-- ============================================================
-- subscription_redemptions — записи о списаниях по абонементу
-- ============================================================
CREATE TABLE public.subscription_redemptions (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_subscription_id  UUID          NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  order_id              UUID          REFERENCES public.orders(id) ON DELETE SET NULL,
  redeemed_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  amount_discounted     NUMERIC(10,2) NOT NULL CHECK (amount_discounted >= 0)
);

-- ============================================================
-- payments — записи об оплатах (управляются только через Edge Functions)
-- ============================================================
CREATE TABLE public.payments (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID          REFERENCES public.orders(id) ON DELETE SET NULL,
  user_subscription_id  UUID          REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  amount                NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status                TEXT          NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'succeeded', 'cancelled', 'failed')),
  provider_transaction_id TEXT        UNIQUE,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- Ровно одно из полей должно быть заполнено
  CONSTRAINT payment_target_check CHECK (
    (order_id IS NULL) != (user_subscription_id IS NULL)
  )
);
