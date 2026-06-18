-- Migration 057: grant anon access to read-only map RPCs
-- get_stores_with_locations and get_active_sub_owner_ids are SECURITY DEFINER
-- (run as postgres) so granting to anon is safe — they only return public data.
-- Without this, unauthenticated clients cannot load the store map.

GRANT EXECUTE ON FUNCTION public.get_stores_with_locations()    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_sub_owner_ids()     TO anon;
