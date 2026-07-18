-- ============================================================
-- Alliby Carry: let a courier drop just the courier capability,
-- keeping the rest of their account (buyer/seller/employee) intact.
-- ============================================================
-- delete-account wipes the whole profile + auth user, which is wrong for
-- someone whose email is also their buyer/store account — they only want
-- to stop being a courier, not lose everything. Same active-order guard
-- as delete-account (can't vanish out from under an in-flight delivery).

CREATE OR REPLACE FUNCTION public.resign_courier()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE carry_courier_id = auth.uid()
      AND status NOT IN ('issued', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Нельзя перестать быть курьером — есть незавершённый заказ';
  END IF;

  UPDATE public.profiles
  SET is_courier                   = false,
      courier_city                 = NULL,
      courier_min_reward           = NULL,
      courier_lat                  = NULL,
      courier_lng                  = NULL,
      courier_location_updated_at  = NULL
  WHERE id = auth.uid() AND is_courier = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a courier account';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resign_courier() TO authenticated;

-- Drive-by consistency fix: update_courier_profile/update_courier_location
-- already refuse to touch a banned courier; register_courier (migration 094,
-- the flag redesign) never re-added that check, so a banned courier could
-- resign and immediately re-register clean. Block re-registration for a
-- courier still marked banned instead.
CREATE OR REPLACE FUNCTION public.register_courier(
  p_full_name  TEXT,
  p_phone      TEXT,
  p_city       TEXT,
  p_min_reward NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_min_reward IS NULL OR p_min_reward < 0 THEN
    RAISE EXCEPTION 'p_min_reward must be a non-negative number';
  END IF;

  UPDATE public.profiles
  SET is_courier           = true,
      full_name            = COALESCE(p_full_name, full_name),
      phone                = COALESCE(p_phone, phone),
      courier_city         = p_city,
      courier_min_reward   = p_min_reward
  WHERE id = auth.uid() AND NOT courier_banned;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found, or banned as a courier';
  END IF;
END;
$$;
