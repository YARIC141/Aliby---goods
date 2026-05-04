-- Fix "column reference remaining_uses is ambiguous" in redeem_subscription.
-- RETURNS TABLE declares an output var with the same name as the column being updated;
-- qualify with the table name inside the CASE expression to resolve it.

CREATE OR REPLACE FUNCTION public.redeem_subscription(
  p_user_subscription_id UUID,
  p_order_id             UUID,
  p_amount_discounted    NUMERIC
)
RETURNS TABLE(redemption_id UUID, remaining_uses INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_us  public.user_subscriptions;
  v_sub public.subscriptions;
  v_redemption_id UUID;
  v_remaining     INTEGER;
BEGIN
  SELECT us.*
  INTO v_us
  FROM public.user_subscriptions us
  WHERE us.id = p_user_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_subscription not found'
      USING ERRCODE = 'P0001', HINT = 'Check user_subscription_id';
  END IF;

  IF v_us.status != 'active' THEN
    RAISE EXCEPTION 'Абонемент не активен (статус: %)', v_us.status
      USING ERRCODE = 'P0002';
  END IF;

  IF v_us.end_date IS NOT NULL AND v_us.end_date < now() THEN
    UPDATE public.user_subscriptions
    SET status = 'expired'
    WHERE id = p_user_subscription_id;

    RAISE EXCEPTION 'Срок действия абонемента истёк'
      USING ERRCODE = 'P0003';
  END IF;

  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE id = v_us.subscription_id;

  IF v_sub.total_uses > 0 AND (v_us.remaining_uses IS NULL OR v_us.remaining_uses <= 0) THEN
    RAISE EXCEPTION 'Остаток использований исчерпан'
      USING ERRCODE = 'P0004';
  END IF;

  IF v_us.last_used_at IS NOT NULL AND
     (v_us.last_used_at AT TIME ZONE 'UTC')::DATE < (now() AT TIME ZONE 'UTC')::DATE
  THEN
    UPDATE public.user_subscriptions
    SET used_today = 0
    WHERE id = p_user_subscription_id;
    v_us.used_today := 0;
  END IF;

  UPDATE public.user_subscriptions us
  SET
    remaining_uses = CASE
                       WHEN v_sub.total_uses > 0 THEN us.remaining_uses - 1
                       ELSE us.remaining_uses
                     END,
    used_today     = us.used_today + 1,
    last_used_at   = now()
  WHERE us.id = p_user_subscription_id
  RETURNING us.remaining_uses INTO v_remaining;

  INSERT INTO public.subscription_redemptions (
    user_subscription_id,
    order_id,
    amount_discounted
  )
  VALUES (p_user_subscription_id, p_order_id, p_amount_discounted)
  RETURNING id INTO v_redemption_id;

  RETURN QUERY SELECT v_redemption_id, v_remaining;
END;
$$;
