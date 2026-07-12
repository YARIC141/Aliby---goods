-- Migration 082: Fix categories RLS to use _owns_store_id() SECURITY DEFINER
-- Same stores-subquery issue as item_price_rules (migrations 079/081).

DROP POLICY IF EXISTS "categories: admin delete" ON public.categories;
DROP POLICY IF EXISTS "categories: admin insert" ON public.categories;
DROP POLICY IF EXISTS "categories: admin update" ON public.categories;

CREATE POLICY "categories: admin delete" ON public.categories FOR DELETE
  USING (store_id IS NOT NULL AND public._owns_store_id(store_id));

CREATE POLICY "categories: admin insert" ON public.categories FOR INSERT
  WITH CHECK (store_id IS NOT NULL AND public._owns_store_id(store_id));

CREATE POLICY "categories: admin update" ON public.categories FOR UPDATE
  USING  (store_id IS NOT NULL AND public._owns_store_id(store_id))
  WITH CHECK (store_id IS NOT NULL AND public._owns_store_id(store_id));

GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
