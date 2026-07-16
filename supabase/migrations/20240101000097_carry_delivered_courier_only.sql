-- ============================================================
-- Enforce: for orders assigned to an Alliby Carry courier (own_courier or
-- carry pool mode both set carry_courier_id), only the courier's own
-- courier_mark_delivered() RPC may set status='issued' — not a direct
-- admin/employee PATCH. Manual-mode deliveries (carry_courier_id stays
-- NULL) are unaffected; admin keeps full control there as before.
--
-- courier_mark_delivered() is SECURITY DEFINER owned by the table owner,
-- so it bypasses RLS entirely and is unaffected by this WITH CHECK.
-- ============================================================

DROP POLICY IF EXISTS "orders: admin or employee update" ON public.orders;

CREATE POLICY "orders: admin or employee update" ON public.orders
FOR UPDATE
USING (
  is_platform_owner() OR is_store_owner_of(store_id) OR is_employee_of(store_id)
)
WITH CHECK (
  (is_platform_owner() OR is_store_owner_of(store_id) OR is_employee_of(store_id))
  AND NOT (status = 'issued' AND carry_courier_id IS NOT NULL)
);
