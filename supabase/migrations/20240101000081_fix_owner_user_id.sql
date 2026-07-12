-- Migration 081: Fix owner column name (owner_id → owner_user_id) in
-- _owns_store_id() and save_item_price_rules() created in 079/080.

CREATE OR REPLACE FUNCTION public._owns_store_id(p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND owner_user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.save_item_price_rules(
  p_item_id UUID,
  p_rules   JSONB
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  SELECT mi.store_id INTO v_store_id
  FROM menu_items mi
  JOIN stores s ON s.id = mi.store_id
  WHERE mi.id = p_item_id AND s.owner_user_id = auth.uid();

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  DELETE FROM item_price_rules WHERE item_id = p_item_id;

  IF p_rules IS NOT NULL AND jsonb_array_length(p_rules) > 0 THEN
    INSERT INTO item_price_rules
      (item_id, store_id, price, label, days, time_from, time_to, priority)
    SELECT
      p_item_id,
      v_store_id,
      (r->>'price')::numeric(10,2),
      NULLIF(r->>'label', ''),
      CASE
        WHEN r->'days' IS NULL OR r->'days' = 'null'::jsonb THEN NULL
        ELSE ARRAY(SELECT jsonb_array_elements_text(r->'days')::int)
      END,
      NULLIF(r->>'time_from', '')::time,
      NULLIF(r->>'time_to',   '')::time,
      (r->>'priority')::int
    FROM jsonb_array_elements(p_rules) WITH ORDINALITY AS t(r, ord)
    ORDER BY ord;
  END IF;
END;
$$;
