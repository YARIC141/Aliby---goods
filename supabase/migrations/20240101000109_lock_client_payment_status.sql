-- Клиент не должен объявлять свои записи и аренды оплаченными.
--
-- Политики вставки проверяли только user_id = auth.uid(), без ограничений
-- на payment_status. Любой авторизованный пользователь мог создать запись
-- с payment_status='paid' напрямую через REST — бесплатно и без абонемента.
-- Именно этим путём шёл и сам клиент при оплате 100%-абонементом, из-за
-- чего использование абонемента никогда не списывалось.
--
-- Отметку об оплате теперь вправе ставить только:
--   * service_role — вебхук банка и edge-функция оплаты абонементом
--     (она же списывает использование);
--   * владелец заведения или его сотрудник — приём оплаты на месте
--     («отметить оплаченной» в кабинете).
-- Покупателю оставлена вставка только неоплаченных записей.

create or replace function public.guard_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid := coalesce(new.store_id, old.store_id);
  v_allowed  boolean;
begin
  -- service_role идёт мимо RLS и триггерных ограничений по смыслу:
  -- это серверные пути, которым мы доверяем.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  v_allowed := is_platform_owner()
            or is_store_owner_of(v_store_id)
            or is_employee_of(v_store_id);

  if tg_op = 'INSERT' then
    if coalesce(new.payment_status, 'unpaid') <> 'unpaid' and not v_allowed then
      raise exception 'Только продавец или сервер может создать оплаченную запись';
    end if;
  else
    if new.payment_status is distinct from old.payment_status and not v_allowed then
      raise exception 'Отметку об оплате ставит сервер или продавец';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_booking_payment on public.bookings;
create trigger trg_guard_booking_payment
  before insert or update on public.bookings
  for each row execute function public.guard_payment_status();

drop trigger if exists trg_guard_rent_payment on public.rent_reservations;
create trigger trg_guard_rent_payment
  before insert or update on public.rent_reservations
  for each row execute function public.guard_payment_status();
