-- Gift subscriptions support
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS gift_status TEXT
  CHECK (gift_status IN ('pending', 'activated'));

-- Atomic activation: creates recipient's copy, marks original as activated.
-- SECURITY DEFINER needed to read/update another user's row.
CREATE OR REPLACE FUNCTION public.activate_gift_subscription(p_gift_sub_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_gift   public.user_subscriptions%ROWTYPE;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_gift
  FROM public.user_subscriptions
  WHERE id = p_gift_sub_id AND gift_status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_gift.user_id = auth.uid() THEN
    RAISE EXCEPTION 'self_activation';
  END IF;

  INSERT INTO public.user_subscriptions (
    user_id, subscription_id, purchase_date, start_date,
    end_date, remaining_uses, status
  ) VALUES (
    auth.uid(),
    v_gift.subscription_id,
    v_gift.purchase_date,
    v_gift.start_date,
    v_gift.end_date,
    v_gift.remaining_uses,
    v_gift.status
  ) RETURNING id INTO v_new_id;

  UPDATE public.user_subscriptions
  SET gift_status = 'activated'
  WHERE id = p_gift_sub_id;

  RETURN v_new_id;
END;
$$;
