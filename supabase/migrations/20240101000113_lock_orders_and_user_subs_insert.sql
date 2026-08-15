-- Заказы и абонементы создаёт только сервер.
--
-- Политики вставки разрешали клиенту писать в обе таблицы напрямую:
--   orders            — with check (user_id = auth.uid())
--   user_subscriptions— with check (user_id = auth.uid())
-- без ограничений на status, total_amount, remaining_uses и end_date.
--
-- Последствия:
--   * заказ со status='paid' и total_amount=0 создавался прямым запросом
--     к REST в обход tbank-init — вся серверная проверка цен обходилась;
--   * пользователь мог выдать себе любой абонемент, включая стопроцентный,
--     с любым остатком использований и сроком, ничего не заплатив.
--
-- Ни клиент, ни кабинет, ни приложение курьера не вставляют эти строки:
--   * заказы создают tbank-init и tbank-notify,
--   * абонементы — tbank-init-sub и его вебхук,
--   * подарок активирует RPC activate_gift_subscription (SECURITY DEFINER).
-- Все они работают под service_role, на который RLS не распространяется,
-- поэтому политики вставки для обычного пользователя просто убираем.

drop policy if exists "orders: user insert" on public.orders;
drop policy if exists "user_subscriptions: insert own" on public.user_subscriptions;
-- на случай расхождения имён между окружениями
drop policy if exists "user_subscriptions: user insert" on public.user_subscriptions;

-- Явных INSERT-политик не остаётся: при включённом RLS это значит «никому,
-- кроме service_role». Чтение и обновление своих строк не затрагиваются.
