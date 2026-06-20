-- Migration 060: promo_consent on profiles
-- Users can opt in to promo notifications from stores in their city.
-- Admin selects "всем в городе" audience to target consenting users.

ALTER TABLE public.profiles
  ADD COLUMN promo_consent boolean NOT NULL DEFAULT false;
