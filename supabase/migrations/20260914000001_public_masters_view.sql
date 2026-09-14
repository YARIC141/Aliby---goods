-- Migration: public read access to master profiles for booking clients
--
-- Bug: "profiles: select own or admin" (20240101000071) only lets a caller read a
-- profiles row when it's their own, they're the platform owner, they own the store
-- the row is an employee of, or they own a store the row has booked into. A regular
-- client browsing a store's Тренеры (masters) tab or booking modal satisfies none of
-- those, so every client-side query for is_master=true profiles (loadStoreMasters,
-- the caSched schedule fetch, booking-modal master lookups, my-bookings master
-- names) has always returned zero rows for real customers — only accounts with
-- is_platform_owner()/store-owner privileges ever saw masters render.
--
-- Fix: expose only the public-facing master fields (never phone/address/email) through
-- a view instead of widening profiles' own RLS, which would leak PII on is_master rows.
-- The view is owned by the migration role, so — per Postgres view semantics — it reads
-- through profiles' RLS as that owner, not as the querying client; its own WHERE clause
-- is what actually scopes the exposed rows to masters.

CREATE OR REPLACE VIEW public.public_masters AS
SELECT id, employee_store_id, full_name, master_bio, master_photo_url
FROM public.profiles
WHERE is_master = true;

GRANT SELECT ON public.public_masters TO anon, authenticated;
