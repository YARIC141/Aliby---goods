-- ============================================================
-- Интернет-эквайринг: настройки платёжной системы заведения
-- ============================================================

-- Добавить в stores: публичные поля провайдера (читаются всеми)
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS payment_provider TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_test_mode BOOLEAN DEFAULT true;

-- Добавить в orders: статус оплаты и ID транзакции провайдера
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_provider_id TEXT;

-- Отдельная таблица для секретных ключей (ограниченный доступ)
CREATE TABLE IF NOT EXISTS public.store_payment_settings (
  store_id      UUID        PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  terminal_key  TEXT,
  secret_key    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.store_payment_settings ENABLE ROW LEVEL SECURITY;

-- Только владелец заведения может читать/писать свои ключи
CREATE POLICY "sps: owner select"
  ON public.store_payment_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = store_id
        AND stores.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "sps: owner insert"
  ON public.store_payment_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = store_id
        AND stores.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "sps: owner update"
  ON public.store_payment_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = store_id
        AND stores.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "sps: owner delete"
  ON public.store_payment_settings FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = store_id
        AND stores.owner_user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
