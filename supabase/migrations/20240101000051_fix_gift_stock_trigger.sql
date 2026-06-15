-- Fix: gift activation triggers stock decrement again (stock was already decremented at purchase).
-- Use a session-local flag so the trigger skips decrement during activate_gift_subscription.

CREATE OR REPLACE FUNCTION public.trg_decrement_sub_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Gift activations reuse an already-purchased slot; skip decrement.
  IF current_setting('aliby.gift_activation', true) = 'true' THEN
    RETURN NEW;
  END IF;

  UPDATE public.subscriptions
  SET stock_sold = stock_sold + 1
  WHERE id = NEW.subscription_id
    AND (stock_total IS NULL OR stock_sold < stock_total);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'out_of_stock';
  END IF;
  RETURN NEW;
END;
$$;

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

  -- Tell the stock trigger this is a gift activation (slot already counted at purchase).
  PERFORM set_config('aliby.gift_activation', 'true', true);

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
