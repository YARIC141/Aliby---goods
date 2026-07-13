-- Migration 086: Group multiple rent_reservations under a single T-Bank payment
-- Lets a rent-cart checkout (several reservations at once) be paid as one
-- transaction: all rows in the group share payment_group_id = the primary
-- reservation's id, and tbank-rent-notify marks the whole group paid together.
ALTER TABLE public.rent_reservations
  ADD COLUMN IF NOT EXISTS payment_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_rent_res_payment_group
  ON public.rent_reservations(payment_group_id);
