-- Migration 054: RPC upgrade_to_seller
-- Allows a user with role='user' (buyer) to upgrade their account
-- to role='admin' (seller) from the admin panel.
-- SECURITY DEFINER so it bypasses RLS and can update profiles directly.
CREATE OR REPLACE FUNCTION public.upgrade_to_seller()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET role = 'admin'
  WHERE id = auth.uid()
    AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'upgrade_failed: account not eligible for upgrade (already a seller or not found)';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upgrade_to_seller() TO authenticated;
