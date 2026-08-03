-- Clone "Хокку" store into "Хокку 2" and "Хокку 3" for yarich92@gmail.com
-- Run with: psql $DB_URL -f seed_hokku_clone.sql

DO $$
DECLARE
  v_user_id        UUID;
  v_src_store_id   UUID;
  v_store2_id      UUID;
  v_store3_id      UUID;

  -- category mapping: old_id → new_id (for store 2 and 3)
  v_cat            RECORD;
  v_cat2_id        UUID;
  v_cat3_id        UUID;

  v_item           RECORD;
BEGIN

  -- 1. Find yarich92 user
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'yarich92@gmail.com';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User yarich92@gmail.com not found';
  END IF;
  RAISE NOTICE 'User ID: %', v_user_id;

  -- 2. Find source "Хокку" store
  SELECT id INTO v_src_store_id
  FROM public.stores
  WHERE owner_user_id = v_user_id AND name = 'Хокку'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_src_store_id IS NULL THEN
    RAISE EXCEPTION 'Store "Хокку" for yarich92 not found';
  END IF;
  RAISE NOTICE 'Source store ID: %', v_src_store_id;

  -- 3. Create "Хокку 2"
  INSERT INTO public.stores (
    name, address, latitude, longitude, phone, working_hours,
    owner_user_id, avg_order_amount, direction, city,
    payment_provider, payment_test_mode,
    image_url, is_visible, store_category_id
  )
  SELECT
    'Хокку 2', address, latitude, longitude, phone, working_hours,
    owner_user_id, avg_order_amount, direction, city,
    payment_provider, payment_test_mode,
    image_url,
    false,  -- скрыто по умолчанию, владелец включит сам
    store_category_id
  FROM public.stores WHERE id = v_src_store_id
  RETURNING id INTO v_store2_id;
  RAISE NOTICE 'Created Хокку 2: %', v_store2_id;

  -- 4. Create "Хокку 3"
  INSERT INTO public.stores (
    name, address, latitude, longitude, phone, working_hours,
    owner_user_id, avg_order_amount, direction, city,
    payment_provider, payment_test_mode,
    image_url, is_visible, store_category_id
  )
  SELECT
    'Хокку 3', address, latitude, longitude, phone, working_hours,
    owner_user_id, avg_order_amount, direction, city,
    payment_provider, payment_test_mode,
    image_url,
    false,
    store_category_id
  FROM public.stores WHERE id = v_src_store_id
  RETURNING id INTO v_store3_id;
  RAISE NOTICE 'Created Хокку 3: %', v_store3_id;

  -- 5. Copy store-specific categories and menu items for each new store
  FOR v_cat IN
    SELECT * FROM public.categories WHERE store_id = v_src_store_id
  LOOP
    -- Category for store 2
    INSERT INTO public.categories (name, store_id)
    VALUES (v_cat.name, v_store2_id)
    RETURNING id INTO v_cat2_id;

    -- Category for store 3
    INSERT INTO public.categories (name, store_id)
    VALUES (v_cat.name, v_store3_id)
    RETURNING id INTO v_cat3_id;

    -- Menu items for store 2 (this category)
    INSERT INTO public.menu_items (
      store_id, category_id, name, description, price,
      image_url, is_available, preparation_time, is_passport_required
    )
    SELECT
      v_store2_id, v_cat2_id, name, description, price,
      image_url, is_available, preparation_time, is_passport_required
    FROM public.menu_items
    WHERE store_id = v_src_store_id AND category_id = v_cat.id;

    -- Menu items for store 3 (this category)
    INSERT INTO public.menu_items (
      store_id, category_id, name, description, price,
      image_url, is_available, preparation_time, is_passport_required
    )
    SELECT
      v_store3_id, v_cat3_id, name, description, price,
      image_url, is_available, preparation_time, is_passport_required
    FROM public.menu_items
    WHERE store_id = v_src_store_id AND category_id = v_cat.id;

  END LOOP;

  -- 6. Items with NULL category (global categories or uncategorised)
  INSERT INTO public.menu_items (
    store_id, category_id, name, description, price,
    image_url, is_available, preparation_time, is_passport_required
  )
  SELECT
    v_store2_id, category_id, name, description, price,
    image_url, is_available, preparation_time, is_passport_required
  FROM public.menu_items
  WHERE store_id = v_src_store_id AND category_id IS NULL;

  INSERT INTO public.menu_items (
    store_id, category_id, name, description, price,
    image_url, is_available, preparation_time, is_passport_required
  )
  SELECT
    v_store3_id, category_id, name, description, price,
    image_url, is_available, preparation_time, is_passport_required
  FROM public.menu_items
  WHERE store_id = v_src_store_id AND category_id IS NULL;

  RAISE NOTICE 'Done. Хокку 2=%  Хокку 3=%', v_store2_id, v_store3_id;
END $$;
