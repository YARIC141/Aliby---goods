-- ============================================================
-- Fix: duplicate orders from a payment webhook being delivered (or
-- processed) more than once for the same payment_intent. Both
-- tbank-store-notify (real T-Bank webhook) and tbank-notify (test-mode
-- emulation) previously did a plain SELECT-then-later-DELETE on
-- payment_intents, which is not atomic — two concurrent/duplicate
-- calls could both see the intent still present and both insert an
-- order. claimed_at gives them an atomic UPDATE ... WHERE claimed_at
-- IS NULL to race on: only one wins and proceeds to create the order;
-- the loser returns immediately. On a genuine processing failure the
-- claim is released (claimed_at reset to NULL) so a legitimate retry
-- can still succeed later.
-- ============================================================

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
