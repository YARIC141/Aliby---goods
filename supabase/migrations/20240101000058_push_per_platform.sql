-- Migration 058: allow android and web push subscriptions to coexist per user
-- Previously UNIQUE(user_id, app) meant native overwrote web subscription.
-- Now UNIQUE(user_id, app, platform) so each platform has its own row.

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT push_subscriptions_user_id_app_key;

DROP INDEX IF EXISTS push_subscriptions_user_app_idx;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_app_platform_key
    UNIQUE (user_id, app, platform);

-- Update save_device_token to conflict on (user_id, app, platform)
CREATE OR REPLACE FUNCTION public.save_device_token(
  p_user_id   uuid,
  p_app       text,
  p_token     text,
  p_platform  text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.push_subscriptions
    (user_id, app, device_token, platform, endpoint, p256dh, auth_key)
  VALUES
    (p_user_id, p_app, p_token, p_platform, p_token, '', '')
  ON CONFLICT (user_id, app, platform) DO UPDATE SET
    device_token = EXCLUDED.device_token,
    endpoint     = EXCLUDED.endpoint;
END;
$$;
