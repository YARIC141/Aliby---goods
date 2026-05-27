-- Add city column to stores; fix min preparation_time for services

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT 'Самара';

UPDATE public.stores SET city = 'Самара' WHERE city = 'Самара'; -- no-op, ensures default is applied

-- Fix preparation_time = 0 for services → set to 5 min minimum
UPDATE public.menu_items mi
SET preparation_time = 5
FROM public.stores s
WHERE mi.store_id = s.id
  AND s.direction = 'services'
  AND mi.preparation_time = 0;
