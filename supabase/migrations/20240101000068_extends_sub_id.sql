-- Migration 068: track which subscription a payment extends
-- When a user buys a regular plan during an active cancelled trial,
-- the new period stacks onto the trial's end_date rather than starting today.

ALTER TABLE public.platform_subscriptions
  ADD COLUMN IF NOT EXISTS extends_sub_id UUID REFERENCES public.platform_subscriptions(id);
