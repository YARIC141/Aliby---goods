-- Статус синхронизации: когда календарь (Google/Apple) последний раз забирал ленту
ALTER TABLE public.calendar_feed_tokens ADD COLUMN IF NOT EXISTS last_fetched_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_calendar_sync_status()
RETURNS TABLE (has_token boolean, last_fetched_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM calendar_feed_tokens WHERE user_id = auth.uid()),
         (SELECT t.last_fetched_at FROM calendar_feed_tokens t WHERE t.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.get_calendar_sync_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_sync_status() TO authenticated;
