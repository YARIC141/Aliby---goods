-- Клиент подписывается на realtime по user_subscriptions и rent_reservations,
-- но таблиц не было в публикации -> "Unable to subscribe to changes".
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='user_subscriptions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_subscriptions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='rent_reservations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rent_reservations;
  END IF;
END $$;
