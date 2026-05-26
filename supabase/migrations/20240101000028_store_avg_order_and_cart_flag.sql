-- Average order amount on stores + helper function for cart badge on map
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS avg_order_amount INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.stores.avg_order_amount IS 'Shown on map marker as "~N ₽". NULL = hidden.';

CREATE OR REPLACE FUNCTION public.get_active_sub_owner_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT DISTINCT user_id FROM public.platform_subscriptions
  WHERE status = 'active' AND (end_date IS NULL OR end_date >= CURRENT_DATE);
$$;

GRANT EXECUTE ON FUNCTION public.get_active_sub_owner_ids() TO authenticated;
