-- Migration 053: rename is_alcohol → is_passport_required on menu_items.
-- The old column was added directly on VPS without a migration file,
-- so we handle both cases (rename if exists, otherwise add fresh).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'menu_items'
      AND column_name  = 'is_alcohol'
  ) THEN
    ALTER TABLE public.menu_items RENAME COLUMN is_alcohol TO is_passport_required;
  ELSE
    ALTER TABLE public.menu_items
      ADD COLUMN IF NOT EXISTS is_passport_required BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
