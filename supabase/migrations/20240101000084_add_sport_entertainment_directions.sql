-- Migration 084: Add 'sport' and 'entertainment' to stores direction constraint
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_direction_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_direction_check
  CHECK (direction = ANY(ARRAY['food','goods','services','sport','entertainment']));
