-- push_subscriptions_app_check никогда не включал 'carry' — из-за этого
-- save_device_token(p_app='carry') всегда падал с 23514 (400 у PostgREST),
-- и ни один FCM-токен курьерского приложения не мог сохраниться.
ALTER TABLE public.push_subscriptions DROP CONSTRAINT push_subscriptions_app_check;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_app_check CHECK (app = ANY (ARRAY['client', 'admin', 'carry']));
