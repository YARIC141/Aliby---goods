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

  -- pg_net 0.14+: body is jsonb (not text), headers is last named param
  PERFORM net.http_post(
    url     := 'https://alliby.ru/functions/v1/send-push',
    body    := jsonb_build_object(
                 'user_id', NEW.user_id,
                 'type',    v_type,
                 'data',    jsonb_build_object('order_id', NEW.id::text)
               ),
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-push-secret', 'Zw8hHn4mv3ee1XzbX12H7EutpMv2lLyo'
               )
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

-- RPC: save or update native device token
-- Called from WebView bridge; bypasses PostgREST schema cache issues
CREATE OR REPLACE FUNCTION public.save_device_token(
  p_user_id  UUID,
  p_app      TEXT,
  p_token    TEXT,
  p_platform TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.push_subscriptions
    (user_id, app, device_token, platform, endpoint, p256dh, auth_key)
  VALUES
    (p_user_id, p_app, p_token, p_platform, p_token, '', '')
  ON CONFLICT (user_id, app) DO UPDATE SET
    device_token = EXCLUDED.device_token,
    platform     = EXCLUDED.platform,
    endpoint     = EXCLUDED.endpoint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_device_token TO authenticated;
