-- ============================================================
-- Fix: infinite recursion in "profiles: select couriers for store admins"
-- ============================================================
-- The policy added in 20240101000089 checked the caller's own role via an inline
-- `EXISTS (SELECT 1 FROM public.profiles me WHERE ...)` subquery written directly in
-- the policy body. That subquery runs as the calling role (not privilege-elevated),
-- so it re-triggers RLS on profiles — including this very policy — causing Postgres
-- to detect infinite recursion and error out on every profiles SELECT for logged-in
-- users (reproduced live: "infinite recursion detected in policy for relation
-- profiles"). The established fix in this codebase (see is_admin()/is_employee_of())
-- is to move the self-check into a SECURITY DEFINER function, which reads profiles
-- without re-entering RLS.

CREATE OR REPLACE FUNCTION public.is_admin_or_employee()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'employee')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_employee() TO authenticated, anon;

DROP POLICY IF EXISTS "profiles: select couriers for store admins" ON public.profiles;
CREATE POLICY "profiles: select couriers for store admins"
  ON public.profiles FOR SELECT
  USING (
    role = 'courier'
    AND (public.is_platform_owner() OR public.is_admin_or_employee())
  );
