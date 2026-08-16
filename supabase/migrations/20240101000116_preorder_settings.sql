-- Заказ ко времени без предоплаты: настройки заведения + поле оплаты заказа.
--
-- stores.working_hours остаётся свободным текстом только для отображения —
-- он непригоден для серверной проверки «заказ только в рабочее время»,
-- поэтому добавляем отдельные структурные поля именно для preorder.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS preorder_enabled      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preorder_opens        TIME,
  ADD COLUMN IF NOT EXISTS preorder_closes       TIME,
  ADD COLUMN IF NOT EXISTS preorder_weekdays     SMALLINT[]  NOT NULL DEFAULT '{1,2,3,4,5,6,7}',
  ADD COLUMN IF NOT EXISTS preorder_prep_minutes INTEGER     NOT NULL DEFAULT 20
                           CHECK (preorder_prep_minutes >= 0);

COMMENT ON COLUMN public.stores.preorder_enabled IS 'Разрешён ли заказ ко времени без предоплаты';
COMMENT ON COLUMN public.stores.preorder_opens IS 'Начало окна приёма заказов ко времени (время суток)';
COMMENT ON COLUMN public.stores.preorder_closes IS 'Конец окна приёма заказов ко времени (время суток)';
COMMENT ON COLUMN public.stores.preorder_weekdays IS 'Рабочие дни для заказа ко времени, 1=Пн..7=Вс';
COMMENT ON COLUMN public.stores.preorder_prep_minutes IS 'Минимальное время приготовления в минутах — нельзя выбрать pickup_time раньше now()+это значение';

-- Заказ без онлайн-оплаты (оплата при получении).
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check,
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('card', 'subscription', 'mixed', 'later'));

NOTIFY pgrst, 'reload schema';
