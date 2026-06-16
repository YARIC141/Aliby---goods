-- Migration 052: add legal columns to profiles, change store is_visible default,
-- add get_store_legal_info RPC for client app to fetch seller credentials.

-- 1. Legal fields on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS inn        TEXT,
  ADD COLUMN IF NOT EXISTS ogrn       TEXT;

-- 2. New stores default to NOT visible (owner must add legal data and enable manually)
ALTER TABLE public.stores
  ALTER COLUMN is_visible SET DEFAULT false;

-- 3. RPC: returns legal info for a given store; SECURITY DEFINER so any
--    authenticated/anon user can fetch the seller's public legal details
--    without seeing the rest of the profile row.
CREATE OR REPLACE FUNCTION public.get_store_legal_info(p_store_id UUID)
RETURNS TABLE(legal_name TEXT, inn TEXT, ogrn TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT pr.legal_name, pr.inn, pr.ogrn
  FROM public.stores s
  JOIN public.profiles pr ON pr.id = s.owner_user_id
  WHERE s.id = p_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_store_legal_info(UUID) TO anon, authenticated;
