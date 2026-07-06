-- Migration 065: ensure one device token belongs to only one user per app
-- Problem: if two users log in on the same device, both get the same FCM token
-- stored in push_subscriptions. Push sent to user A's token reaches user B's device.
-- Fix: delete any other user's row with the same token before inserting.

CREATE OR REPLACE FUNCTION public.save_device_token(
  p_user_id  UUID,
  p_app      TEXT,
  p_token    TEXT,
  p_platform TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Remove stale associations: same token, same app, different user
  DELETE FROM public.push_subscriptions
  WHERE device_token = p_token
    AND app = p_app
    AND user_id <> p_user_id;

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
