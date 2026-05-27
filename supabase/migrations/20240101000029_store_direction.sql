-- Store direction (food / goods / services) + matching store_categories direction
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'food'
    CHECK (direction IN ('food','goods','services'));

COMMENT ON COLUMN public.stores.direction IS 'Business direction: food | goods | services';

ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'food'
    CHECK (direction IN ('food','goods','services'));

COMMENT ON COLUMN public.store_categories.direction IS 'Associated direction: food | goods | services';

-- Reclassify existing non-food categories
UPDATE public.store_categories
  SET direction = 'goods'
  WHERE name IN ('Продукты', 'Аптека');

-- Goods categories
INSERT INTO public.store_categories (name, icon, direction) VALUES
  ('Одежда',            '👗', 'goods'),
  ('Электроника',       '📱', 'goods'),
  ('Мебель',            '🪑', 'goods'),
  ('Книги',             '📚', 'goods'),
  ('Спорттовары',       '⚽', 'goods'),
  ('Косметика',         '💄', 'goods'),
  ('Цветы',             '💐', 'goods'),
  ('Зоотовары',         '🐾', 'goods'),
  ('Игрушки',           '🧸', 'goods'),
  ('Ювелирные изделия', '💎', 'goods')
ON CONFLICT (name) DO NOTHING;

-- Services categories
INSERT INTO public.store_categories (name, icon, direction) VALUES
  ('Парикмахерская',       '✂️',  'services'),
  ('Салон красоты',        '💅',  'services'),
  ('Фитнес-центр',         '🏋️', 'services'),
  ('Автосервис',           '🔧',  'services'),
  ('Прачечная',            '👕',  'services'),
  ('Химчистка',            '🧹',  'services'),
  ('Ремонт обуви',         '👟',  'services'),
  ('Фотостудия',           '📷',  'services'),
  ('Ветеринарная клиника', '🐶',  'services'),
  ('Массаж',               '💆',  'services')
ON CONFLICT (name) DO NOTHING;
