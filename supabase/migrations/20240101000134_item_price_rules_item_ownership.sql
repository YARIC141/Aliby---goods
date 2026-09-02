-- price_rules_insert/update (миграции 078/079) проверяют только, что
-- store_id принадлежит владельцу, но не что item_id реально относится к
-- этому store_id. Безопасный путь (RPC save_item_price_rules, миграция 080)
-- сам подставляет верный store_id по item_id, но прямой INSERT/UPDATE через
-- REST в обход RPC позволял указать СВОЙ store_id вместе с ЧУЖИМ item_id —
-- владелец A мог подложить арендному товару владельца B правило вида
-- «0.01 ₽, круглосуточно, priority=999», которое начинало применяться
-- (item_rule_price сортирует только по priority/item_id, не по store_id).
--
-- Фикс: та же SECURITY DEFINER проверка, что и для store_id, но теперь
-- также требует, чтобы menu_items.id = item_id действительно лежал в этом
-- store_id.

CREATE OR REPLACE FUNCTION public._item_belongs_to_store(p_item_id UUID, p_store_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.menu_items WHERE id = p_item_id AND store_id = p_store_id
  );
$$;

GRANT EXECUTE ON FUNCTION public._item_belongs_to_store TO authenticated;

DROP POLICY IF EXISTS "price_rules_insert" ON public.item_price_rules;
DROP POLICY IF EXISTS "price_rules_update" ON public.item_price_rules;

CREATE POLICY "price_rules_insert"
  ON public.item_price_rules FOR INSERT
  WITH CHECK (public._owns_store_id(store_id) AND public._item_belongs_to_store(item_id, store_id));

CREATE POLICY "price_rules_update"
  ON public.item_price_rules FOR UPDATE
  USING  (public._owns_store_id(store_id))
  WITH CHECK (public._owns_store_id(store_id) AND public._item_belongs_to_store(item_id, store_id));
