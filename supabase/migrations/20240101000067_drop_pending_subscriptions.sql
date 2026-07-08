-- Migration 067: remove pending user_subscriptions and clean up status constraint
-- Pending = payment never confirmed; only paid (active/expired) subs are valid.

DELETE FROM public.user_subscriptions WHERE status = 'pending';

ALTER TABLE public.user_subscriptions
  ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;

ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
    CHECK (status IN ('active', 'expired', 'cancelled'));
