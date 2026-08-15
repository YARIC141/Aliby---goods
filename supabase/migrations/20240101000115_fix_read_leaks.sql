-- Три утечки на чтение между продавцами.
--
-- Общая причина: в политике стояла проверка is_admin(), которая означает
-- «роль продавца вообще», а не «владелец этого заведения». Проверено на
-- боевой базе: продавец с одним заведением видел все 18 аренд платформы и
-- все 22 подписи договоров, включая чужие email, IP и user-agent.
--
-- Там, где проверка идёт через подзапрос к orders (payments, order_items),
-- утечки нет: вложенный select сам ограничен политикой orders.

-- ── 1. Аренды: владелец конкретного заведения, а не любой продавец ───────
drop policy if exists "rent_reservations: select" on public.rent_reservations;
create policy "rent_reservations: select"
  on public.rent_reservations for select
  using (
    user_id = auth.uid()
    or is_platform_owner()
    or is_store_owner_of(store_id)
    or is_employee_of(store_id)
  );

-- ── 2. Подписи договоров: своя или владелец платформы ────────────────────
-- Здесь нет привязки к заведению, поэтому продавцу чужие подписи не нужны
-- вовсе: в строке лежат email, IP-адрес, user-agent и имя подписанта.
drop policy if exists "contract_signatures: select own or admin" on public.contract_signatures;
create policy "contract_signatures: select own or platform owner"
  on public.contract_signatures for select
  using (user_id = auth.uid() or is_platform_owner());

-- ── 3. Аналитика: читается только через RPC ──────────────────────────────
-- analytics_events был открыт на чтение всем (policy using true), а часть
-- событий содержит user_id — например store_sub_started и payment_success.
-- Приложения таблицу напрямую не читают: клиент только пишет события,
-- кабинет берёт сводку через get_store_analytics (SECURITY DEFINER),
-- которому RLS не мешает. Политику чтения убираем целиком.
drop policy if exists "analytics_select_auth" on public.analytics_events;
