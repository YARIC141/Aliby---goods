-- Migration 079: Fix item_price_rules RLS
-- The subquery `store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())`
-- can return empty results when stores table's own RLS blocks the inner SELECT.
-- Solution: wrap the check in a SECURITY DEFINER function that bypasses RLS.

CREATE OR REPLACE FUNCTION public._owns_store_id(p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND owner_user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public._owns_store_id TO authenticated;

DROP POLICY IF EXISTS "price_rules_insert" ON public.item_price_rules;
DROP POLICY IF EXISTS "price_rules_update" ON public.item_price_rules;
DROP POLICY IF EXISTS "price_rules_delete" ON public.item_price_rules;

CREATE POLICY "price_rules_insert"
  ON public.item_price_rules FOR INSERT
  WITH CHECK (public._owns_store_id(store_id));

CREATE POLICY "price_rules_update"
  ON public.item_price_rules FOR UPDATE
  USING  (public._owns_store_id(store_id))
  WITH CHECK (public._owns_store_id(store_id));

CREATE POLICY "price_rules_delete"
  ON public.item_price_rules FOR DELETE
  USING  (public._owns_store_id(store_id));
