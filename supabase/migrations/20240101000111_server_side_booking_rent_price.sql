-- Цену записи и аренды считает сервер, а не устройство покупателя.
--
-- bookings.total_price и rent_reservations.total_price вставлял клиент, а
-- edge-функции оплаты (tbank-init-booking / tbank-init-rent /
-- tbank-init-rent-cart) брали сумму прямо из этой строки. RLS ограничивала
-- только user_id, поэтому услугу за 5 000 ₽ можно было оплатить рублём,
-- отправив свой total_price напрямую в REST.
--
-- Здесь цена пересчитывается по каталогу в BEFORE INSERT и присланное
-- значение просто перезаписывается. Обновление строки не трогаем: продавцу
-- бывает нужно скорректировать сумму вручную.

-- ── Цена позиции с учётом правил по дню недели и времени ─────────────────
-- Повторяет клиентский _getRulePrice: подходящие правила сортируются по
-- priority, при равенстве берётся меньшая цена; если ничего не подошло —
-- базовая цена позиции.
create or replace function public.item_rule_price(
  p_item_id uuid,
  p_date    date,
  p_time    time
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select r.price
        from public.item_price_rules r
       where r.item_id = p_item_id
         and (r.days is null or array_length(r.days, 1) is null
              or extract(dow from p_date)::int = any(r.days))
         and p_time >= coalesce(r.time_from, time '00:00')
         and p_time <  coalesce(r.time_to,   time '24:00')
       order by coalesce(r.priority, 0), r.price
       limit 1
    ),
    (select m.price from public.menu_items m where m.id = p_item_id),
    0
  );
$$;

-- ── Стоимость аренды за период ───────────────────────────────────────────
-- Для часов и минут цена суммируется по слотам — правило может отличаться
-- внутри одного периода. Для дней, недель и месяцев берётся цена на дату
-- начала, как это делает корзина в приложении.
create or replace function public.rent_total_price(
  p_item_id  uuid,
  p_start    timestamptz,
  p_end      timestamptz,
  p_quantity integer
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_unit     text;
  v_step     integer;
  v_base     numeric;
  v_local_s  timestamp;
  v_local_e  timestamp;
  v_step_min integer;
  v_slots    integer;
  v_periods  integer;
  v_total    numeric := 0;
  v_cur      timestamp;
  i          integer;
begin
  select coalesce(rent_period_unit, 'hour'), greatest(coalesce(rent_period_step, 1), 1), coalesce(price, 0)
    into v_unit, v_step, v_base
    from public.menu_items where id = p_item_id;

  if not found or p_start is null or p_end is null or p_end <= p_start then
    return 0;
  end if;

  -- Приложение строит период в местном времени, база хранит UTC. Возвращаем
  -- локальное представление, чтобы правила по времени суток совпадали с тем,
  -- что покупатель видел на экране.
  v_local_s := p_start at time zone 'Europe/Moscow';
  v_local_e := p_end   at time zone 'Europe/Moscow';

  if v_unit in ('minute', 'hour') then
    v_step_min := v_step * case when v_unit = 'hour' then 60 else 1 end;
    v_slots := greatest(round(extract(epoch from (v_local_e - v_local_s)) / 60.0 / v_step_min)::int, 0);
    for i in 0 .. greatest(v_slots - 1, -1) loop
      v_cur := v_local_s + make_interval(mins => i * v_step_min);
      v_total := v_total + public.item_rule_price(p_item_id, v_cur::date, v_cur::time);
    end loop;
  else
    if v_unit = 'day' then
      v_periods := round(extract(epoch from (v_local_e - v_local_s)) / 86400.0 / v_step)::int;
    elsif v_unit = 'week' then
      v_periods := round(extract(epoch from (v_local_e - v_local_s)) / 604800.0 / v_step)::int;
    elsif v_unit = 'month' then
      v_periods := round(
        ((extract(year from v_local_e) - extract(year from v_local_s)) * 12
         + (extract(month from v_local_e) - extract(month from v_local_s)))::numeric / v_step
      )::int;
    else
      v_periods := 0;
    end if;
    v_periods := greatest(v_periods, 0);
    v_total := public.item_rule_price(p_item_id, v_local_s::date, time '00:00') * v_periods;
  end if;

  return round(v_total * greatest(coalesce(p_quantity, 1), 1), 2);
end $$;

-- ── Триггеры ─────────────────────────────────────────────────────────────
create or replace function public.set_booking_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric;
begin
  -- Цена мастера имеет приоритет: одна и та же услуга у разных мастеров
  -- может стоить по-разному.
  if new.master_id is not null then
    select price into v_price
      from public.master_services
     where master_id = new.master_id and service_id = new.menu_item_id
     limit 1;
  end if;

  if v_price is null then
    select price into v_price from public.menu_items where id = new.menu_item_id;
  end if;

  new.total_price := coalesce(v_price, 0);
  return new;
end $$;

create or replace function public.set_rent_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.total_price := public.rent_total_price(
    new.item_id, new.start_at, new.end_at, new.quantity
  );
  return new;
end $$;

drop trigger if exists trg_set_booking_price on public.bookings;
create trigger trg_set_booking_price
  before insert on public.bookings
  for each row execute function public.set_booking_price();

drop trigger if exists trg_set_rent_price on public.rent_reservations;
create trigger trg_set_rent_price
  before insert on public.rent_reservations
  for each row execute function public.set_rent_price();

revoke all on function public.item_rule_price(uuid, date, time)  from public, anon, authenticated;
revoke all on function public.rent_total_price(uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;
