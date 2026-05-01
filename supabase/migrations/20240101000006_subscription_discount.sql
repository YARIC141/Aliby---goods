-- ============================================================
-- Миграция 6: Тип и размер скидки для абонементов
-- ============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN discount_type  TEXT          NOT NULL DEFAULT 'fixed'
                            CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN discount_value NUMERIC(10,2) NOT NULL DEFAULT 0
                            CHECK (discount_value >= 0);

COMMENT ON COLUMN public.subscriptions.discount_type  IS 'percent = % от цены товара, fixed = фиксированная сумма скидки';
COMMENT ON COLUMN public.subscriptions.discount_value IS 'Размер скидки: 20 = 20% или 20 = 20 рублей';
