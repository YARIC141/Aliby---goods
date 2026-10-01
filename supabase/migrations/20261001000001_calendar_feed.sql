-- Персональная лента календаря (ICS-подписка Google/Apple). Токен — секрет в URL, перевыпускается.
CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS включён без политик: читает только service_role (Edge Function) и RPC ниже.
ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_calendar_feed_token(p_regenerate boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  uid uuid := auth.uid();
  t   text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT p_regenerate THEN
    SELECT token INTO t FROM calendar_feed_tokens WHERE user_id = uid;
    IF t IS NOT NULL THEN RETURN t; END IF;
  END IF;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO calendar_feed_tokens (user_id, token) VALUES (uid, t)
  ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = now();
  RETURN t;
END $$;
REVOKE ALL ON FUNCTION public.get_calendar_feed_token(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_calendar_feed_token(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_calendar_feed_token()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ DELETE FROM calendar_feed_tokens WHERE user_id = auth.uid(); $$;
REVOKE ALL ON FUNCTION public.revoke_calendar_feed_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_calendar_feed_token() TO authenticated;
