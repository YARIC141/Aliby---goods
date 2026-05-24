-- ============================================================
-- Миграция 24: Изоляция данных по владельцу заведения
-- Каждый администратор видит и редактирует только свои данные.
-- ============================================================

-- STORES: только владелец (owner_user_id) может обновлять и удалять
DROP POLICY IF EXISTS "stores: admin update" ON public.stores;
CREATE POLICY "stores: admin update"
  ON public.stores FOR UPDATE
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "stores: admin delete" ON public.stores;
CREATE POLICY "stores: admin delete"
  ON public.stores FOR DELETE
  USING (owner_user_id = auth.uid());

-- CATEGORIES: только владелец заведения, к которому привязана категория
DROP POLICY IF EXISTS "categories: admin insert" ON public.categories;
CREATE POLICY "categories: admin insert"
  ON public.categories FOR INSERT
  WITH CHECK (
    store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "categories: admin update" ON public.categories;
CREATE POLICY "categories: admin update"
  ON public.categories FOR UPDATE
  USING (
    store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = categories.store_id AND s.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "categories: admin delete" ON public.categories;
CREATE POLICY "categories: admin delete"
  ON public.categories FOR DELETE
  USING (
    store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = categories.store_id AND s.owner_user_id = auth.uid()
    )
  );

-- MENU_ITEMS: только владелец заведения, к которому привязан товар
DROP POLICY IF EXISTS "menu_items: admin insert" ON public.menu_items;
CREATE POLICY "menu_items: admin insert"
  ON public.menu_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "menu_items: admin update" ON public.menu_items;
CREATE POLICY "menu_items: admin update"
  ON public.menu_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = menu_items.store_id AND s.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "menu_items: admin delete" ON public.menu_items;
CREATE POLICY "menu_items: admin delete"
  ON public.menu_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = menu_items.store_id AND s.owner_user_id = auth.uid()
    )
  );

-- SUBSCRIPTIONS: только владелец заведения, к которому привязан абонемент
DROP POLICY IF EXISTS "subscriptions: admin insert" ON public.subscriptions;
CREATE POLICY "subscriptions: admin insert"
  ON public.subscriptions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subscriptions: admin update" ON public.subscriptions;
CREATE POLICY "subscriptions: admin update"
  ON public.subscriptions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = subscriptions.store_id AND s.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = store_id AND s.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "subscriptions: admin delete" ON public.subscriptions;
CREATE POLICY "subscriptions: admin delete"
  ON public.subscriptions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = subscriptions.store_id AND s.owner_user_id = auth.uid()
    )
  );
