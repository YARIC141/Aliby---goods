-- Add description column and fix coverage_rules (add category_ids) for subscriptions

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS description TEXT;

DO $$
DECLARE
  coffee_ids  UUID[];
  burger_ids  UUID[];
  pizza_ids   UUID[];
  beer_ids    UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO coffee_ids  FROM public.categories WHERE name = 'Кофе'    AND store_id IS NULL;
  SELECT ARRAY_AGG(id) INTO burger_ids  FROM public.categories WHERE name = 'Бургеры' AND store_id IS NULL;
  SELECT ARRAY_AGG(id) INTO pizza_ids   FROM public.categories WHERE name = 'Пицца'   AND store_id IS NULL;
  SELECT ARRAY_AGG(id) INTO beer_ids    FROM public.categories WHERE name = 'Пиво'    AND store_id IS NULL;

  -- Fix coverage_rules: add category_ids for include_categories subscriptions
  UPDATE public.subscriptions
  SET coverage_rules = jsonb_build_object('type', 'include_categories', 'category_ids', to_jsonb(coffee_ids))
  WHERE name IN ('Кофейная карта × 10', 'Утренний кофе — месяц');

  UPDATE public.subscriptions
  SET coverage_rules = jsonb_build_object('type', 'include_categories', 'category_ids', to_jsonb(burger_ids))
  WHERE name = 'Бургер-карта × 8';

  UPDATE public.subscriptions
  SET coverage_rules = jsonb_build_object('type', 'include_categories', 'category_ids', to_jsonb(pizza_ids))
  WHERE name = 'Пицца-карта × 8';

  UPDATE public.subscriptions
  SET coverage_rules = jsonb_build_object('type', 'include_categories', 'category_ids', to_jsonb(beer_ids))
  WHERE name = 'Пивная карта × 15';

  -- Descriptions for all 9 subscriptions
  UPDATE public.subscriptions SET description =
    '10 любых напитков из раздела «Кофе» за 30 дней. Не более 2 напитков в день, минимальный интервал между списаниями — 1 час.'
  WHERE name = 'Кофейная карта × 10';

  UPDATE public.subscriptions SET description =
    'Безлимитный кофе по будням до 10:00 в течение месяца. Один напиток в день.'
  WHERE name = 'Утренний кофе — месяц';

  UPDATE public.subscriptions SET description =
    '10 бизнес-ланчей в ресторане «Волга» в рабочие дни. Один обед в день, минимальная сумма заказа — 400 ₽.'
  WHERE name = 'Бизнес-ланч × 10';

  UPDATE public.subscriptions SET description =
    '20 покупок хлеба и выпечки в пекарне «Калач» за 30 дней. До 3 визитов в день в часы работы.'
  WHERE name = 'Хлебная карточка × 20';

  UPDATE public.subscriptions SET description =
    '5 заказов роллов или суши в «Сакура» за 30 дней. Один заказ в день.'
  WHERE name = 'Карта роллов × 5';

  UPDATE public.subscriptions SET description =
    '8 бургеров в «Грильяж» за 30 дней. Один бургер в день.'
  WHERE name = 'Бургер-карта × 8';

  UPDATE public.subscriptions SET description =
    '8 пицц в «Formaggio» за 30 дней. Одна пицца в день.'
  WHERE name = 'Пицца-карта × 8';

  UPDATE public.subscriptions SET description =
    '10 десертов или выпечки в кондитерской «Сахарок» за 30 дней. До 2 угощений в день.'
  WHERE name = 'Сладкая карта × 10';

  UPDATE public.subscriptions SET description =
    '15 бокалов пива в баре «Дубовый» за 30 дней. Действует по четвергам–воскресеньям с 16:00 до 02:00. До 5 бокалов в день.'
  WHERE name = 'Пивная карта × 15';
END; $$;
