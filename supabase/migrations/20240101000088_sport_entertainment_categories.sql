-- Migration 088: "Тип заведения" (store_categories) options for the sport/entertainment
-- directions. Both directions were added to stores.direction by migration 084, but
-- store_categories.direction still only allowed food/goods/services, so stores like
-- КНТС (sport) and Компьютерный клуб Apex (entertainment) had no category to pick from.

ALTER TABLE public.store_categories DROP CONSTRAINT IF EXISTS store_categories_direction_check;
ALTER TABLE public.store_categories ADD CONSTRAINT store_categories_direction_check
  CHECK (direction = ANY(ARRAY['food','goods','services','sport','entertainment']));

-- A handful of existing categories were seeded under direction='food' before sport/
-- entertainment existed, and no store currently references them — reclassify instead
-- of duplicating.
UPDATE public.store_categories SET direction = 'sport'
  WHERE name = 'Фитнес';

UPDATE public.store_categories SET direction = 'entertainment'
  WHERE name IN ('Боулинг', 'Игровой клуб', 'Квест-комната', 'Кинотеатр');

UPDATE public.store_categories SET direction = 'services'
  WHERE name IN ('Барбершоп', 'Массаж', 'Ногтевой сервис', 'Салон красоты', 'СПА', 'Студия загара');

INSERT INTO public.store_categories (name, icon, direction) VALUES
  ('Клуб настольного тенниса', '🏓', 'sport'),
  ('Спортивная секция',        '⚽', 'sport'),
  ('Бассейн',                  '🏊', 'sport'),
  ('Йога-студия',              '🧘', 'sport'),
  ('Танцевальная студия',      '💃', 'sport'),
  ('Единоборства',             '🥋', 'sport'),
  ('Секция программирования',  '💻', 'sport'),
  ('Языковая школа',           '🗣️', 'sport'),
  ('Репетиторский центр',      '📖', 'sport')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.store_categories (name, icon, direction) VALUES
  ('Караоке',        '🎤', 'entertainment'),
  ('Каток',          '⛸️', 'entertainment'),
  ('Бильярдная',     '🎱', 'entertainment'),
  ('Батутный центр', '🤸', 'entertainment'),
  ('VR-клуб',        '🥽', 'entertainment')
ON CONFLICT (name) DO NOTHING;
