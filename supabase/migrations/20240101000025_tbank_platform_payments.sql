-- Allow 'pending' and 'failed' statuses for T-Bank payment flow
ALTER TABLE public.platform_subscriptions
  DROP CONSTRAINT IF EXISTS platform_subscriptions_status_check;

ALTER TABLE public.platform_subscriptions
  ADD CONSTRAINT platform_subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'expired', 'pending', 'failed'));

-- T-Bank payment identifier for callback matching
ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS tbank_payment_id TEXT UNIQUE;
