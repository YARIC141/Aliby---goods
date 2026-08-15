-- Три дыры в политиках кабинета продавца.
--
-- 1. platform_subscriptions — продавец мог выдать себе платную подписку.
--    Политики insert/update требовали лишь user_id = auth.uid(), поэтому
--    строка со status='active' и end_date='2099-12-31' заводилась прямым
--    запросом к REST. Это не только сама подписка за 1 600 руб./мес, но и
--    доставка, рассылки и снятие лимита заведений: user_store_limit()
--    считает слоты по этой же таблице.
--
--    Подписки создают tbank-platform-init и его вебхук под service_role.
--    Клиенту оставлены ровно два действия, которые делает кабинет:
--    отмена своей подписки и привязка оплаченного слота к заведению.
--
-- 2. stores — политика вставки проверяла только is_admin(), без сверки
--    владельца. Продавец мог завести заведение на чужой аккаунт: триггер
--    set_store_owner подставляет auth.uid() лишь когда owner_user_id пуст,
--    а явно указанный чужой id проходил. Лимит заведений при этом
--    списывался с жертвы.
--
-- 3. store_categories — общий справочник платформы (55 типов заведений на
--    5 направлений), а править его мог любой продавец: политика ALL
--    сводилась к is_admin(). Переименование или удаление строки меняло
--    фильтры на карте у всех заведений сразу.

-- ── 1. platform_subscriptions ────────────────────────────────────────────
drop policy if exists "platform_subs: insert own" on public.platform_subscriptions;

create or replace function public.guard_platform_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Продавцу можно отменить свою подписку и привязать уже оплаченный слот
  -- к заведению. Всё, что определяет оплаченность и срок, — только сервер.
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'Статус подписки меняет сервер';
  end if;
  if new.end_date   is distinct from old.end_date
     or new.plan_type  is distinct from old.plan_type
     or new.plan       is distinct from old.plan
     or new.amount_paid is distinct from old.amount_paid
     or new.user_id    is distinct from old.user_id
     or new.is_trial   is distinct from old.is_trial then
    raise exception 'Эти поля подписки меняет сервер';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_platform_subscription on public.platform_subscriptions;
create trigger trg_guard_platform_subscription
  before update on public.platform_subscriptions
  for each row execute function public.guard_platform_subscription();

-- ── 2. stores ────────────────────────────────────────────────────────────
drop policy if exists "stores: admin insert" on public.stores;
create policy "stores: admin insert"
  on public.stores for insert
  with check (is_admin() and owner_user_id = auth.uid());

-- ── 3. store_categories ──────────────────────────────────────────────────
drop policy if exists "store_categories_write_admin" on public.store_categories;
create policy "store_categories: platform owner writes"
  on public.store_categories for all
  using (is_platform_owner())
  with check (is_platform_owner());
