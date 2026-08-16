-- save_device_token падал на КАЖДОМ вызове: ON CONFLICT (user_id, app) не
-- совпадает с реальным ограничением push_subscriptions_user_app_platform_key
-- UNIQUE (user_id, app, platform) — Postgres требует точного совпадения
-- колонок конфликт-таргета с существующим индексом/constraint'ом.
--
-- Итог: ни один Android/iOS токен не сохранялся ни у одного пользователя
-- ни разу — таблица подтверждает 0 записей с platform in ('android','ios').
-- Веб-путь (прямой upsert через PostgREST on_conflict=user_id,app,platform)
-- эту функцию не использует и не был затронут.

CREATE OR REPLACE FUNCTION public.save_device_token(
  p_user_id uuid, p_app text, p_token text, p_platform text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $function$
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
  ON CONFLICT (user_id, app, platform) DO UPDATE SET
    device_token = EXCLUDED.device_token,
    endpoint     = EXCLUDED.endpoint;
END;
$function$;

NOTIFY pgrst, 'reload schema';
