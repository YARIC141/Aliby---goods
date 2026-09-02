-- "bookings: user update" (миграция 033) разрешала пользователю UPDATE
-- своей записи вообще без ограничения полей — WITH CHECK проверял только
-- user_id = auth.uid(). Клиент по факту всегда шлёт либо
-- {status:'cancelled'} (отмена), либо {status:'rescheduled'} (перенос на
-- новый слот), но RLS это не требовала: PATCH .../bookings с
-- {total_price: 1} проходил как обычное обновление своей записи, и
-- следующая оплата (tbank-init-booking берёт сумму из total_price) списывала
-- копейку вместо полной цены.
--
-- rent_reservations этой же уязвимости не подвержена, потому что
-- "rent_reservations: user cancel" (миграция 072) уже требует, чтобы после
-- обновления status = 'cancelled' — подмена total_price ни на что не влияет,
-- т.к. отменённая бронь больше не оплачивается. Применяем тот же приём к
-- bookings: пользователю можно поменять статус только на 'cancelled' или
-- 'rescheduled' (перенос), любые другие поля в этом же запросе роли не
-- играют, т.к. запись выходит из активного/оплачиваемого состояния.

DROP POLICY IF EXISTS "bookings: user update" ON public.bookings;
CREATE POLICY "bookings: user update"
  ON public.bookings FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND status IN ('cancelled', 'rescheduled'));
