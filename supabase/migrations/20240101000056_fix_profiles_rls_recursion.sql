-- Migration 056: fix infinite recursion in profiles RLS
--
-- Root cause: "profiles: update own name" WITH CHECK contained a subquery
-- that re-reads profiles:
--   role = (SELECT role FROM profiles WHERE id = auth.uid())
-- This triggered the SELECT policy again. Previously safe because the
-- SELECT policy used is_admin() (SECURITY DEFINER, bypasses RLS).
-- Migration 055 replaced is_admin() with a non-SECURITY DEFINER EXISTS
-- clause, breaking the cycle protection.
--
-- Fix: wrap the role read in a SECURITY DEFINER function so it bypasses
-- RLS and cannot recurse.

CREATE OR REPLACE FUNCTION public.get_own_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_own_role() TO authenticated, anon;

DROP POLICY IF EXISTS "profiles: update own name" ON public.profiles;
CREATE POLICY "profiles: update own name"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = public.get_own_role());
