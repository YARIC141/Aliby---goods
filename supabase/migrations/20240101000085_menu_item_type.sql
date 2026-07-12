-- Migration 085: Explicit per-item type (product / service / rental)
-- item_type is the authoritative, per-item, direction-independent classification,
-- replacing the old is_rent boolean. duration_minutes is untouched (separate concept:
-- service duration), still used by master_services/booking flow.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product';

UPDATE public.menu_items
  SET item_type = CASE
    WHEN is_rent = TRUE               THEN 'rental'
    WHEN duration_minutes IS NOT NULL THEN 'service'
    ELSE 'product'
  END;

ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_item_type_check;
ALTER TABLE public.menu_items ADD CONSTRAINT menu_items_item_type_check
  CHECK (item_type = ANY(ARRAY['product','service','rental']));

-- is_rent is fully replaced by item_type='rental'; safe to drop — only consumed by
-- admin/index.html and client/index.html (both updated alongside this migration), not by
-- any RLS policy, trigger, RPC or edge function (those key off item_id / rent_reservations).
ALTER TABLE public.menu_items DROP COLUMN IF EXISTS is_rent;
