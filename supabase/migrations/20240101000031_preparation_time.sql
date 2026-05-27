-- Add preparation_time to menu_items (minutes)
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS preparation_time INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.menu_items.preparation_time IS
  'Estimated time in minutes: cooking time (food), prep/packing time (goods), service duration (services). 0 = not specified.';

-- Test values for existing items based on store direction
UPDATE public.menu_items mi
SET preparation_time = CASE s.direction
  WHEN 'food'     THEN (ARRAY[5,7,10,12,15,20,25])[floor(random()*7)::int + 1]
  WHEN 'goods'    THEN (ARRAY[5,7,10,15])[floor(random()*4)::int + 1]
  WHEN 'services' THEN (ARRAY[30,45,60,90])[floor(random()*4)::int + 1]
  ELSE 0
END
FROM public.stores s
WHERE mi.store_id = s.id
  AND mi.preparation_time = 0;
