-- Migration 073: Explicit grants for rent_reservations
-- Self-hosted Supabase may not have ALTER DEFAULT PRIVILEGES set,
-- so new tables don't automatically get grants for anon/authenticated.
-- PostgREST cannot include a table in its schema cache without SELECT on it.

GRANT SELECT, INSERT, UPDATE ON public.rent_reservations TO authenticated;
GRANT SELECT                  ON public.rent_reservations TO anon;

-- Force PostgREST to reload its schema cache to pick up the new table
NOTIFY pgrst, 'reload schema';
