-- "master_services: owner insert/update" (миграция 070) проверяют только,
-- что master_id — сотрудник магазина текущего владельца, но не что
-- service_id (menu_items) относится к этому же магазину. UPDATE к тому же
-- не имел WITH CHECK вообще — после прохождения USING можно было записать
-- в строку что угодно.
--
-- Эксплойт: владелец A назначает своему мастеру service_id, принадлежащий
-- ЧУЖОМУ menu_items у владельца B, с любой ценой. Забронировав такую
-- связку (store_id = B, menu_item_id = чужая услуга, master_id = свой
-- мастер), set_booking_price (миграция 111) берёт price из master_services
-- в приоритете — деньги по сделке всё равно уйдут владельцу B (store_id в
-- bookings берётся из услуги/сессии, не из master_services), но по цене,
-- которую произвольно назначил себе владелец A, а не реальный владелец
-- услуги.
--
-- Фикс: требуем, чтобы service_id принадлежал тому же store_id, что и
-- master_id (через profiles.employee_store_id), и добавляем недостающий
-- WITH CHECK на UPDATE.

CREATE OR REPLACE FUNCTION public._master_and_service_same_store(p_master_id UUID, p_service_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.menu_items mi ON mi.store_id = p.employee_store_id
    WHERE p.id = p_master_id AND mi.id = p_service_id
  );
$$;

GRANT EXECUTE ON FUNCTION public._master_and_service_same_store TO authenticated;

DROP POLICY IF EXISTS "master_services: owner insert" ON public.master_services;
CREATE POLICY "master_services: owner insert"
  ON public.master_services FOR INSERT
  WITH CHECK (
    is_platform_owner() OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.stores s ON s.id = p.employee_store_id
        WHERE p.id = master_services.master_id
          AND s.owner_user_id = auth.uid()
      )
      AND public._master_and_service_same_store(master_services.master_id, master_services.service_id)
    )
  );

DROP POLICY IF EXISTS "master_services: owner update" ON public.master_services;
CREATE POLICY "master_services: owner update"
  ON public.master_services FOR UPDATE
  USING (
    is_platform_owner() OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.stores s ON s.id = p.employee_store_id
      WHERE p.id = master_services.master_id
        AND s.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_platform_owner() OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.stores s ON s.id = p.employee_store_id
        WHERE p.id = master_services.master_id
          AND s.owner_user_id = auth.uid()
      )
      AND public._master_and_service_same_store(master_services.master_id, master_services.service_id)
    )
  );
