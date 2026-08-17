-- Позволяет отметить конкретную опцию (например, размер "Большой") как
-- временно недоступную, не удаляя её из группы и не выключая всю позицию.
ALTER TABLE public.menu_item_options
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

NOTIFY pgrst, 'reload schema';
