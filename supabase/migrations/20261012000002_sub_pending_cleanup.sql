-- Неоплаченные покупки абонементов: возврат остатка и автоочистка.
-- Триггер trg_sub_stock занимает stock_sold при INSERT (в т.ч. pending),
-- поэтому при удалении pending-записи освобождаем экземпляр обратно.
CREATE OR REPLACE FUNCTION public.trg_release_sub_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status = 'pending' AND OLD.gift_status IS NULL THEN
    UPDATE public.subscriptions
       SET stock_sold = GREATEST(stock_sold - 1, 0)
     WHERE id = OLD.subscription_id;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_sub_stock_release ON public.user_subscriptions;
CREATE TRIGGER trg_sub_stock_release
  AFTER DELETE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_release_sub_stock();

-- Удаляет неоплаченные (pending) покупки старше p_age вместе с платежами.
CREATE OR REPLACE FUNCTION public.expire_stale_pending_subscriptions(p_age interval DEFAULT interval '2 hours')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE ids uuid[]; n integer;
BEGIN
  SELECT array_agg(id) INTO ids FROM public.user_subscriptions
   WHERE status = 'pending' AND gift_status IS NULL AND purchase_date < now() - p_age;
  IF ids IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.payments WHERE user_subscription_id = ANY(ids) AND status = 'pending';
  DELETE FROM public.user_subscriptions WHERE id = ANY(ids) AND status = 'pending';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.expire_stale_pending_subscriptions(interval) FROM PUBLIC, anon, authenticated;

-- Расписание (pg_cron) не включено сюда намеренно; запуск по расписанию включает владелец:
-- SELECT cron.schedule('expire-stale-pending-subs', '*/15 * * * *', 'SELECT public.expire_stale_pending_subscriptions()');
