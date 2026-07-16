-- ============================================================
-- Alliby Carry (1/3): роль courier — фрилансер-курьер
-- ============================================================

-- 1. Расширяем CHECK-ограничение на profiles.role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'employee', 'courier'));

-- 2. Новые колонки для курьеров
-- Имя/телефон уже есть (full_name, phone) — не дублируем.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS courier_city                TEXT,
  ADD COLUMN IF NOT EXISTS courier_min_reward          NUMERIC(10,2) CHECK (courier_min_reward >= 0),
  ADD COLUMN IF NOT EXISTS courier_lat                 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS courier_lng                 DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS courier_location_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS courier_banned              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS courier_banned_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS courier_ban_reason          TEXT;

-- 3. Регистрация/редактирование — узкие SECURITY DEFINER RPC, не открытый PATCH через REST.
-- Самозапись: только user -> courier, никогда не трогает admin/employee.
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
  SET role                = 'courier',
      full_name            = COALESCE(p_full_name, full_name),
      phone                = COALESCE(p_phone, phone),
      courier_city         = p_city,
      courier_min_reward   = p_min_reward
  WHERE id = auth.uid() AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only a fresh user account can register as a courier';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_courier_profile(
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
  SET full_name          = COALESCE(p_full_name, full_name),
      phone              = COALESCE(p_phone, phone),
      courier_city       = p_city,
      courier_min_reward = p_min_reward
  WHERE id = auth.uid() AND role = 'courier' AND NOT courier_banned;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a courier account (or banned)';
  END IF;
END;
$$;

-- Called periodically by the Carry app while online.
CREATE OR REPLACE FUNCTION public.update_courier_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET courier_lat                 = p_lat,
      courier_lng                 = p_lng,
      courier_location_updated_at = now()
  WHERE id = auth.uid() AND role = 'courier' AND NOT courier_banned;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a courier account (or banned)';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_courier(TEXT, TEXT, TEXT, NUMERIC)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_courier_profile(TEXT, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_courier_location(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- 4. RLS: store owners/employees нужно уметь найти курьера (по телефону/имени), чтобы
-- добавить его в "свой список" (store_couriers, следующая миграция). Курьерские профили
-- не так чувствительны, как чужие приватные профили — открываем их на чтение любому
-- admin/employee/платформенному владельцу (не обычным пользователям и не другим курьерам).
DROP POLICY IF EXISTS "profiles: select couriers for store admins" ON public.profiles;
CREATE POLICY "profiles: select couriers for store admins"
  ON public.profiles FOR SELECT
  USING (
    role = 'courier'
    AND (
      public.is_platform_owner()
      OR EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.role IN ('admin', 'employee'))
    )
  );
