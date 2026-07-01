-- Migration 054: remove passport_required logic.
-- Delete menu items marked as passport-required (alcohol, tobacco, etc.),
-- then drop the column — these categories are now prohibited by Лицензионный договор §5.5
-- and cannot be listed on the platform at all.

DELETE FROM public.menu_items
WHERE is_passport_required = true;

ALTER TABLE public.menu_items
  DROP COLUMN IF EXISTS is_passport_required;
