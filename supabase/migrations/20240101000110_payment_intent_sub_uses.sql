-- Сколько использований абонемента списать, когда оплата подтвердится.
--
-- Корзина покрывает абонементом до remaining_uses единиц товара, поэтому
-- списать нужно ровно столько, сколько было покрыто на момент расчёта, а не
-- одно. Считает это tbank-init, а применяет tbank-notify после подтверждения
-- платежа — до тех пор списывать нечего, заказ может и не оплатиться.
alter table public.payment_intents
  add column if not exists subscription_uses integer not null default 0;

-- Атомарное списание использований абонемента.
--
-- Раньше заказы товаров вообще не уменьшали remaining_uses: и бесплатная
-- ветка tbank-init, и вебхук tbank-notify писали строку в
-- subscription_redemptions, но счётчик не трогали — абонемент давал скидку
-- бесконечно. Считаем в одном UPDATE, чтобы параллельные заказы не могли
-- прочитать одно и то же значение и списать дважды.
--
-- remaining_uses = null означает безлимит и не трогается.
create or replace function public.consume_subscription_uses(
  p_user_subscription_id uuid,
  p_uses integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_uses is null or p_uses <= 0 then
    return;
  end if;

  update public.user_subscriptions
     set remaining_uses = greatest(0, remaining_uses - p_uses),
         last_used_at   = now(),
         used_today     = case
                            when last_used_at is null
                              or (last_used_at at time zone 'Europe/Moscow')::date
                                 < (now() at time zone 'Europe/Moscow')::date
                            then p_uses
                            else coalesce(used_today, 0) + p_uses
                          end
   where id = p_user_subscription_id
     and remaining_uses is not null;

  -- Безлимитный абонемент: счётчик не трогаем, но отметку об использовании
  -- ставим — на неё опираются дневной лимит и минимальный интервал.
  update public.user_subscriptions
     set last_used_at = now(),
         used_today   = case
                          when last_used_at is null
                            or (last_used_at at time zone 'Europe/Moscow')::date
                               < (now() at time zone 'Europe/Moscow')::date
                          then p_uses
                          else coalesce(used_today, 0) + p_uses
                        end
   where id = p_user_subscription_id
     and remaining_uses is null;
end $$;

revoke all on function public.consume_subscription_uses(uuid, integer) from public, anon, authenticated;
