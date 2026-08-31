-- ============================================================
-- Alliby Carry: отдельное согласие на геолокацию при включении смены
-- ============================================================
-- §6.2 Оферты (site.alliby.ru/carry-terms) описывает обработку геопозиции
-- курьера на протяжении статуса «На смене» как основанную на отдельном
-- согласии, запрашиваемом отдельным экраном при первом включении смены —
-- отдельно от акцепта самой Оферты. Этот столбец и RPC — техническая
-- реализация этого согласия.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS courier_geo_consent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_courier_geo_consent()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET courier_geo_consent_at = now()
  WHERE id = auth.uid() AND is_courier = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a courier account';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_courier_geo_consent() TO authenticated;
