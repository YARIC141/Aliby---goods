-- ============================================================
-- Миграция 22: Подписки продавцов на платформу
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_subscriptions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan        TEXT        NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  start_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  end_date    DATE        NOT NULL,
  amount_paid INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.platform_subscriptions IS 'Подписки продавцов на платформу Aliby. Monthly = 1000 ₽/мес, Yearly = 10 000 ₽/год.';
COMMENT ON COLUMN public.platform_subscriptions.plan       IS 'monthly = 30 дней, yearly = 365 дней';
COMMENT ON COLUMN public.platform_subscriptions.status     IS 'active | cancelled | expired';
COMMENT ON COLUMN public.platform_subscriptions.amount_paid IS 'Сумма в рублях на момент оплаты';

ALTER TABLE public.platform_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_subs: select own or admin"
  ON public.platform_subscriptions FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "platform_subs: insert own"
  ON public.platform_subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "platform_subs: update own"
  ON public.platform_subscriptions FOR UPDATE
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_platform_subs_user
  ON public.platform_subscriptions(user_id, status, end_date DESC);
