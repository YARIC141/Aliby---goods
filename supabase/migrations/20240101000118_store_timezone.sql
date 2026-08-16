-- Часовой пояс заведения для «Заказа ко времени».
--
-- Окно приёма (preorder_opens/closes) владелец задаёт в своём местном
-- времени. Раньше сервер сверял его с МСК: заведение в Самаре (UTC+4),
-- закрывающее приём в 19:00, принимало заказы до 20:00 по-самарски.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Moscow';

COMMENT ON COLUMN public.stores.timezone IS
  'IANA-зона заведения; в ней трактуются preorder_opens/preorder_closes и «текущий рабочий день»';

NOTIFY pgrst, 'reload schema';
