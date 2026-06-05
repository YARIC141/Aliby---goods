-- Include 'grace' in active subscription check (grace = paid but renewal failed, still has access)
CREATE OR REPLACE FUNCTION public.get_active_sub_owner_ids()
RETURNS TABLE(user_id UUID) LANGUAGE sql SECURITY DEFINER STABLE AS $f$
  SELECT DISTINCT user_id
  FROM public.platform_subscriptions
  WHERE status IN ('active', 'grace')
    AND end_date >= CURRENT_DATE;
$f$;
