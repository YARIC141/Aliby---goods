-- Migration: native push notifications support
-- Adds device_token column to push_subscriptions and
-- a trigger that calls send-push edge function on order status change.

-- 1. Добавляем поле device_token (FCM/APNs токен устройства)
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_token TEXT,
  ADD COLUMN IF NOT EXISTS platform      TEXT CHECK (platform IN ('ios', 'android', 'web'));

-- Индекс для быстрого поиска по user_id + app
CREATE INDEX IF NOT EXISTS push_subscriptions_user_app_idx
  ON public.push_subscriptions (user_id, app);

-- 2. Функция-триггер: при смене статуса заказа → вызвать send-push
CREATE OR REPLACE FUNCTION notify_order_status_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_push_secret TEXT := current_setting('app.push_webhook_secret', true);
  v_fn_url      TEXT := current_setting('app.supabase_url', true) || '/functions/v1/send-push';
  v_type        TEXT;
BEGIN
  -- Только при реальной смене статуса
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_type := CASE NEW.status
    WHEN 'in_progress' THEN 'order_in_progress'
    WHEN 'ready'       THEN 'order_ready'
    WHEN 'issued'      THEN 'order_issued'
    WHEN 'cancelled'   THEN 'order_cancelled'
    ELSE NULL
  END;

  IF v_type IS NULL THEN RETURN NEW; END IF;

  -- Асинхронный HTTP вызов через pg_net (не блокирует транзакцию)
  PERFORM net.http_post(
    url     := v_fn_url,
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'x-push-secret',   v_push_secret
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id,
      'type',    v_type,
      'data',    jsonb_build_object('order_id', NEW.id)
    )::text
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_status_push
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_status_push();

-- 3. Аналогичный триггер для бронирований
CREATE OR REPLACE FUNCTION notify_booking_status_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_push_secret TEXT := current_setting('app.push_webhook_secret', true);
  v_fn_url      TEXT := current_setting('app.supabase_url', true) || '/functions/v1/send-push';
  v_type        TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_type := CASE NEW.status
    WHEN 'confirmed' THEN 'booking_confirmed'
    WHEN 'cancelled' THEN 'booking_cancelled'
    ELSE NULL
  END;

  IF v_type IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := v_fn_url,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-push-secret',  v_push_secret
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id,
      'type',    v_type,
      'data',    jsonb_build_object('booking_id', NEW.id)
    )::text
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_booking_status_push
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION notify_booking_status_push();

-- Примечание: app.push_webhook_secret и app.supabase_url задаются через:
-- ALTER DATABASE postgres SET app.push_webhook_secret = 'ваш_секрет';
-- ALTER DATABASE postgres SET app.supabase_url = 'https://ваш_проект.supabase.co';
