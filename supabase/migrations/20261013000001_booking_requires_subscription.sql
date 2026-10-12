-- Онлайн-запись и бронирование — только для заведений с активной подпиской Alliby Бизнес.
-- Клиент не может создать запись (bookings) или бронь аренды (rent_reservations)
-- в заведении без подписки — ни с оплатой, ни с оплатой на месте.
-- Владелец, сотрудники, владелец платформы и service_role (серверные пути: оплата,
-- групповые RPC) — без ограничений.

CREATE OR REPLACE FUNCTION public.guard_booking_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF is_platform_owner() OR is_store_owner_of(NEW.store_id) OR is_employee_of(NEW.store_id) THEN
    RETURN NEW;
  END IF;
  IF NOT is_store_subscription_active(NEW.store_id) THEN
    RAISE EXCEPTION 'Онлайн-запись в этом заведении сейчас недоступна'
      USING ERRCODE = 'P0001', HINT = 'store_subscription_inactive';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS booking_a00_subscription_gate ON public.bookings;
CREATE TRIGGER booking_a00_subscription_gate
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_subscription();

DROP TRIGGER IF EXISTS rent_a00_subscription_gate ON public.rent_reservations;
CREATE TRIGGER rent_a00_subscription_gate
  BEFORE INSERT ON public.rent_reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_booking_subscription();
