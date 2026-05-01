-- ============================================================
-- Store Categories: справочник типов/категорий заведений
-- icon — emoji или короткий строковый код (напр. ☕ 🍽️)
-- ============================================================

CREATE TABLE public.store_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  icon       TEXT        NOT NULL DEFAULT '🏪',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT store_categories_name_key UNIQUE (name)
);

ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_categories_read_all"
  ON public.store_categories FOR SELECT USING (true);

CREATE POLICY "store_categories_write_admin"
  ON public.store_categories FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- FK в таблице stores
ALTER TABLE public.stores
  ADD COLUMN store_category_id UUID REFERENCES public.store_categories(id) ON DELETE SET NULL;

CREATE INDEX idx_stores_category ON public.stores(store_category_id);

-- Базовый справочник
INSERT INTO public.store_categories(name, icon) VALUES
  ('Кофейня',      '☕'),
  ('Ресторан',     '🍽️'),
  ('Пекарня',      '🥐'),
  ('Фаст-фуд',     '🍔'),
  ('Продукты',     '🛒'),
  ('Пиццерия',     '🍕'),
  ('Суши-бар',     '🍣'),
  ('Бар',          '🍺'),
  ('Кондитерская', '🍰'),
  ('Аптека',       '💊')
ON CONFLICT DO NOTHING;
