-- Migration 071: Allow store owners to read profiles of their booking clients
-- Fixes: admin cannot see client info in booking details (RLS blocked non-employee profiles)

DROP POLICY IF EXISTS "profiles: select own or admin" ON public.profiles;

CREATE POLICY "profiles: select own or admin"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR public.is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.owner_user_id = auth.uid()
        AND profiles.employee_store_id = s.id
    )
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.stores s ON s.id = b.store_id
      WHERE s.owner_user_id = auth.uid()
        AND b.user_id = profiles.id
    )
  );
