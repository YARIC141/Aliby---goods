-- Add items_per_use: how many covered items are discounted per single redemption.
-- Default 1 — each swipe of the subscription covers one item.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS items_per_use INTEGER NOT NULL DEFAULT 1;
