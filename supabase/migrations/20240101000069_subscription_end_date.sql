-- Migration 069: subscription_end_date on profiles + fix plan check constraint

-- Denormalized end-date for quick "active until" reads and period stacking in tbank-platform-init
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_end_date DATE;

-- Allow 3months and 6months plan values (previously only monthly/yearly were allowed)
ALTER TABLE public.platform_subscriptions
  DROP CONSTRAINT IF EXISTS platform_subscriptions_plan_check;

ALTER TABLE public.platform_subscriptions
  ADD CONSTRAINT platform_subscriptions_plan_check
  CHECK (plan = ANY (ARRAY['monthly'::text, '3months'::text, '6months'::text, 'yearly'::text]));
