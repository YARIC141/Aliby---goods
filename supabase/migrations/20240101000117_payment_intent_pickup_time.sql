-- Заказ ко времени с оплатой сейчас: pickup_time должен пережить платёжный
-- intent и попасть в заказ, который создаёт tbank-store-notify по вебхуку.
-- orders.pickup_time уже существует в схеме (просто не был задействован).

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS pickup_time TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
