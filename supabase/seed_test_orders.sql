-- Тестовые заказы для yarich92@gmail.com (Кофейня «Пробуждение»)
-- 7 месяцев: окт 2025 — апр 2026, с нарастающей экономией по абонементам

DO $$
DECLARE
  uid       UUID := 'aea8c549-2d24-4532-84ae-a184d4413538';
  sid       UUID := 'aeafa1ee-baec-4ebd-974c-fbd3cae5e2d4';
  espresso  UUID := '5c03ed06-438f-47ee-bd15-deabf0e0ef49'; -- 120
  americano UUID := '1fa935a8-329a-4b61-9e9a-1f617a31e68f'; -- 160
  croissant UUID := 'eded40f7-90e4-4e0c-94bd-755222dfc2da'; -- 180
  cappuccino UUID := '7c3d3bc0-5815-4b10-a4b8-542a4a55dc4a'; -- 190
  latte     UUID := '8204696c-b2a8-4a92-b441-0862d80d43ed'; -- 210
  flatwhite UUID := '87eb9dc2-e5ad-404b-a83b-8009f7a85b73'; -- 220
  raf       UUID := 'f1420ebf-2560-410b-8653-c28b49f4efe7'; -- 250
  cheesecake UUID := 'f821d801-9c15-4291-8d33-7ea835c7111c'; -- 280
  tiramisu  UUID := '8031c38b-1f07-4fec-a0d5-db2ee2dd9d05'; -- 290
  avotoast  UUID := 'f004b0bb-0bc5-43a1-9f36-a01317e68331'; -- 320
  oid       UUID;
BEGIN

  -- ── Октябрь 2025 (экономия 170) ──────────────────────────────────────
  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2025-10-15 10:30:00+00', 'issued', 330, 'mixed', 90) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, espresso,  2, 120.00), (oid, croissant,  1, 180.00);

  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2025-10-22 09:15:00+00', 'issued', 270, 'mixed', 80) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, cappuccino, 1, 190.00), (oid, americano, 1, 160.00);

  -- ── Ноябрь 2025 (экономия 240) ───────────────────────────────────────
  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2025-11-08 11:00:00+00', 'issued', 570, 'mixed', 130) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, latte, 2, 210.00), (oid, cheesecake, 1, 280.00);

  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2025-11-20 14:20:00+00', 'issued', 430, 'mixed', 110) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, raf, 1, 250.00), (oid, tiramisu, 1, 290.00);

  -- ── Декабрь 2025 (экономия 330) ──────────────────────────────────────
  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2025-12-05 10:00:00+00', 'issued', 580, 'mixed', 150) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, flatwhite, 2, 220.00), (oid, tiramisu, 1, 290.00);

  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2025-12-18 16:45:00+00', 'issued', 640, 'mixed', 180) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, raf, 2, 250.00), (oid, avotoast, 1, 320.00);

  -- ── Январь 2026 (экономия 150, спад после праздников) ────────────────
  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2026-01-12 09:30:00+00', 'issued', 240, 'mixed', 100) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, americano, 1, 160.00), (oid, croissant, 1, 180.00);

  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2026-01-25 12:00:00+00', 'issued', 140, 'mixed', 50) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, cappuccino, 1, 190.00);

  -- ── Февраль 2026 (экономия 250) ──────────────────────────────────────
  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2026-02-10 10:45:00+00', 'issued', 360, 'mixed', 130) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, latte, 1, 210.00), (oid, cheesecake, 1, 280.00);

  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2026-02-20 15:30:00+00', 'issued', 320, 'mixed', 120) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, flatwhite, 2, 220.00);

  -- ── Март 2026 (экономия 380) ─────────────────────────────────────────
  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2026-03-07 11:00:00+00', 'issued', 620, 'mixed', 200) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, raf, 2, 250.00), (oid, avotoast, 1, 320.00);

  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2026-03-19 13:15:00+00', 'issued', 600, 'mixed', 180) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, latte, 1, 210.00), (oid, tiramisu, 1, 290.00), (oid, cheesecake, 1, 280.00);

  -- ── Апрель 2026 (экономия 520) ───────────────────────────────────────
  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2026-04-08 10:00:00+00', 'issued', 730, 'mixed', 250) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, flatwhite, 3, 220.00), (oid, avotoast, 1, 320.00);

  INSERT INTO public.orders (user_id, store_id, order_time, status, total_amount, payment_method, subscription_discount)
  VALUES (uid, sid, '2026-04-22 17:00:00+00', 'issued', 800, 'mixed', 270) RETURNING id INTO oid;
  INSERT INTO public.order_items (order_id, menu_item_id, quantity, price_at_time) VALUES
    (oid, raf, 2, 250.00), (oid, tiramisu, 1, 290.00), (oid, cheesecake, 1, 280.00);

END;
$$;
