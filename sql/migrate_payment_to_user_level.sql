-- Migration: move payment settings from stores to profiles/user_payment_settings
-- Run once on Supabase SQL editor or via psql

-- 1. Add payment columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS payment_provider   text    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS payment_test_mode  boolean NOT NULL DEFAULT true;

-- 2. Create user_payment_settings (one row per owner)
CREATE TABLE IF NOT EXISTS user_payment_settings (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terminal_key     text,
  secret_key       text,
  terminal_key_test  text,
  secret_key_test    text,
  key_version      int  NOT NULL DEFAULT 1,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_payment_settings ENABLE ROW LEVEL SECURITY;
-- No RLS policies — only accessed via service role key in edge functions

-- 3. Migrate payment_provider / payment_test_mode from stores → profiles
--    Take whichever store had a real provider (not 'none') for each owner.
--    If all stores are 'none', the profile stays 'none' (default).
UPDATE profiles p
SET
  payment_provider  = s.payment_provider,
  payment_test_mode = s.payment_test_mode
FROM (
  SELECT DISTINCT ON (owner_user_id)
    owner_user_id,
    payment_provider,
    payment_test_mode
  FROM stores
  WHERE payment_provider != 'none'
  ORDER BY owner_user_id, payment_provider
) s
WHERE p.id = s.owner_user_id;

-- 4. Migrate keys from store_payment_settings → user_payment_settings
--    Take the most-recently-updated row per owner.
INSERT INTO user_payment_settings
  (user_id, terminal_key, secret_key, terminal_key_test, secret_key_test, key_version, updated_at)
SELECT DISTINCT ON (s.owner_user_id)
  s.owner_user_id,
  sps.terminal_key,
  sps.secret_key,
  sps.terminal_key_test,
  sps.secret_key_test,
  sps.key_version,
  sps.updated_at
FROM store_payment_settings sps
JOIN stores s ON s.id = sps.store_id
ORDER BY s.owner_user_id, sps.updated_at DESC
ON CONFLICT (user_id) DO NOTHING;
