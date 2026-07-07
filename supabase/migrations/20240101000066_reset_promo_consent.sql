-- Migration 066: reset promo_consent for all users
-- Reason: new explicit consent dialog replaces the old banner mechanism.
-- Client-side localStorage key is also renamed to alliby_promo_consent_v2
-- so old accepted values are ignored and users see the new dialog.

UPDATE public.profiles SET promo_consent = false WHERE promo_consent = true;
