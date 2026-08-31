-- ============================================================
-- Alliby Carry: дата рождения, налоговый статус, ИНН, раздельное
-- согласие на обработку персональных данных при регистрации курьера
-- ============================================================
-- §7.1 Оферты требует раздельного оформления акцепта Оферты и согласия на
-- обработку ПД (отдельными чекбоксами). §2.4/§2.4а требуют подтверждения
-- возраста — до сих пор это был только самостоятельный чекбокс «мне
-- исполнилось 18 лет» без даты рождения для серверной проверки. Налоговый
-- статус/ИНН нужны, так как курьер — независимый исполнитель, а не
-- сотрудник платформы (см. п.1 Оферты).
--
-- Существующие курьеры, зарегистрированные до этой миграции, не
-- переспрашиваются задним числом — новые поля остаются NULL для них,
-- требование действует только для новых регистраций через обновлённую
-- форму.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS courier_birthdate      DATE,
  ADD COLUMN IF NOT EXISTS courier_tax_status      TEXT CHECK (courier_tax_status IN ('individual', 'self_employed', 'ip')),
  ADD COLUMN IF NOT EXISTS courier_inn             TEXT,
  ADD COLUMN IF NOT EXISTS courier_pd_consent_at   TIMESTAMPTZ;

-- Old 4-arg overload must be dropped explicitly — CREATE OR REPLACE with a
-- different parameter list creates a second overload instead of replacing
-- it, which breaks PostgREST RPC routing (ambiguous function name).
DROP FUNCTION IF EXISTS public.register_courier(TEXT, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.register_courier(
  p_full_name   TEXT,
  p_phone       TEXT,
  p_city        TEXT,
  p_min_reward  NUMERIC,
  p_birthdate   DATE,
  p_tax_status  TEXT,
  p_inn         TEXT,
  p_pd_consent  BOOLEAN
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

  IF p_birthdate IS NULL OR p_birthdate > (current_date - interval '18 years') THEN
    RAISE EXCEPTION 'Courier must be at least 18 years old';
  END IF;

  IF p_tax_status IS NULL OR p_tax_status NOT IN ('individual', 'self_employed', 'ip') THEN
    RAISE EXCEPTION 'p_tax_status must be one of individual, self_employed, ip';
  END IF;

  IF p_tax_status IN ('self_employed', 'ip') AND (p_inn IS NULL OR length(trim(p_inn)) = 0) THEN
    RAISE EXCEPTION 'p_inn is required for self_employed/ip tax status';
  END IF;

  IF p_pd_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'Personal data processing consent is required';
  END IF;

  UPDATE public.profiles
  SET is_courier           = true,
      full_name            = COALESCE(p_full_name, full_name),
      phone                = COALESCE(p_phone, phone),
      courier_city         = p_city,
      courier_min_reward   = p_min_reward,
      courier_birthdate    = p_birthdate,
      courier_tax_status   = p_tax_status,
      courier_inn          = CASE WHEN p_tax_status IN ('self_employed', 'ip') THEN trim(p_inn) ELSE NULL END,
      courier_pd_consent_at = COALESCE(courier_pd_consent_at, now())
  WHERE id = auth.uid() AND NOT courier_banned;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found, or banned as a courier';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_courier(TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT, TEXT, BOOLEAN) TO authenticated;
