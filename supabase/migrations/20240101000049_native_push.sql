-- Migration: native push notifications support
-- Applied: 2026-06-15 via Supabase API
--
-- 1. device_token + platform columns on push_subscriptions
-- 2. DB trigger: orders status change → send-push edge function

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS device_token TEXT,
  ADD COLUMN IF NOT EXISTS platform      TEXT CHECK (platform IN ('ios', 'android', 'web'));

CREATE INDEX IF NOT EXISTS push_subscriptions_user_app_idx
  ON public.push_subscriptions (user_id, app);

-- Trigger function: order status → push notification
-- Uses x-push-secret header matching PUSH_WEBHOOK_SECRET Edge Function secret
CREATE OR REPLACE FUNCTION notify_order_status_push()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_type := CASE NEW.status
    WHEN 'in_progress' THEN 'order_in_progress'
    WHEN 'ready'       THEN 'order_ready'
    WHEN 'issued'      THEN 'order_issued'
    WHEN 'cancelled'   THEN 'order_cancelled'
    ELSE NULL
  END;

  IF v_type IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := 'https://bucxawpwttvtwdwdtuhh.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-push-secret', 'alliby_push_2026'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'type',    v_type,
      'data',    jsonb_build_object('order_id', NEW.id::text)
    )::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_push ON public.orders;
CREATE TRIGGER trg_order_status_push
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_order_status_push();

-- Note: booking trigger will be added when bookings table exists (migration 033)
