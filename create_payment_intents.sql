-- Migration: replace pending orders with payment_intents staging table
-- Run: docker exec -i supabase-db psql -U postgres -d postgres < create_payment_intents.sql

CREATE TABLE IF NOT EXISTS payment_intents (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id                     UUID        NOT NULL,
  items                        JSONB       NOT NULL,
  total_amount                 INTEGER     NOT NULL,
  subscription_discount        INTEGER     NOT NULL DEFAULT 0,
  applied_user_subscription_id UUID,
  payment_method               TEXT        NOT NULL DEFAULT 'card',
  is_delivery                  BOOLEAN     NOT NULL DEFAULT FALSE,
  delivery_fee                 INTEGER     NOT NULL DEFAULT 0,
  delivery_address             TEXT,
  payment_token                TEXT        UNIQUE,
  provider                     TEXT        NOT NULL DEFAULT 'none',
  provider_payment_id          TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_intents" ON payment_intents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- pg_cron: delete abandoned intents older than 2 hours, runs every hour
SELECT cron.schedule(
  'cleanup-payment-intents',
  '0 * * * *',
  $$DELETE FROM payment_intents WHERE created_at < NOW() - INTERVAL '2 hours'$$
);
