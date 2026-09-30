-- Migration: отдельное направление 'education' (раньше «Спорт и образование» было одним 'sport').
-- Направление выкатывается выключенным: app_config.client.ui.directions.education = false.
-- Включить: UPDATE app_config SET config = jsonb_set(config, '{ui,directions,education}', 'true') WHERE scope = 'client';

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_direction_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_direction_check
  CHECK (direction = ANY(ARRAY['food','goods','services','sport','entertainment','education']));

ALTER TABLE public.store_categories DROP CONSTRAINT IF EXISTS store_categories_direction_check;
ALTER TABLE public.store_categories ADD CONSTRAINT store_categories_direction_check
  CHECK (direction = ANY(ARRAY['food','goods','services','sport','entertainment','education']));

-- Образовательные категории переезжают из sport в education
UPDATE public.store_categories SET direction = 'education'
  WHERE name IN ('Языковая школа', 'Репетиторский центр', 'Секция программирования');

-- Заведения этих категорий — следом
UPDATE public.stores SET direction = 'education'
  WHERE direction = 'sport'
    AND store_category_id IN (SELECT id FROM public.store_categories WHERE direction = 'education');

-- Флаг направления (выключен), остальные ключи конфига не трогаем
INSERT INTO public.app_config(scope, config)
VALUES ('client', '{"ui":{"directions":{"education":false}}}')
ON CONFLICT (scope) DO UPDATE
  SET config = jsonb_set(
        app_config.config,
        '{ui}',
        COALESCE(app_config.config->'ui', '{}'::jsonb)
          || jsonb_build_object('directions',
               COALESCE(app_config.config->'ui'->'directions', '{}'::jsonb)
               || jsonb_build_object('education',
                    COALESCE(app_config.config->'ui'->'directions'->'education', 'false'::jsonb))),
        true),
      updated_at = now();
