-- Stock tracking for subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stock_total INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stock_sold  INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.subscriptions.stock_total IS 'Total units available for sale. NULL = unlimited.';
COMMENT ON COLUMN public.subscriptions.stock_sold  IS 'Units sold so far. Incremented atomically by trigger.';

CREATE OR REPLACE FUNCTION public.trg_decrement_sub_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_sub_stock ON public.user_subscriptions;
CREATE TRIGGER trg_sub_stock
BEFORE INSERT ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trg_decrement_sub_stock();
