-- Seed: restaurant "Перчини" for yarich92@gmail.com
-- Menu sourced from polyana.delivery
-- Photos are NOT copied (per project rule)

DO $$
DECLARE
  v_user_id   UUID;
  v_store_id  UUID;
  cat_id      UUID;
BEGIN

  SELECT id INTO v_user_id FROM auth.users WHERE email = 'yarich92@gmail.com';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User yarich92@gmail.com not found';
  END IF;

  -- Create store (hidden by default, owner enables manually)
  INSERT INTO public.stores (
    name, address, latitude, longitude, phone, working_hours,
    owner_user_id, direction, city, payment_provider, payment_test_mode,
    is_visible
  ) VALUES (
    'Перчини',
    'Самара',
    NULL, NULL,
    NULL, NULL,
    v_user_id, 'food', 'Самара', 'none', true,
    false
  ) RETURNING id INTO v_store_id;

  RAISE NOTICE 'Created store Перчини: %', v_store_id;

  -- ── Пицца с бортиками ──────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Пицца с бортиками', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Пицца Пепперони с бортиками',                      350,  true, 20),
    (v_store_id, cat_id, 'Пицца Маргарита с бортиками',                       370,  true, 20),
    (v_store_id, cat_id, 'Пицца с грушей с бортиками',                        450,  true, 20),
    (v_store_id, cat_id, 'Пицца Сальсичча с бортиками',                       470,  true, 20),
    (v_store_id, cat_id, 'Пицца 4 Сыра с манговым чатни с бортиками',        490,  true, 20),
    (v_store_id, cat_id, 'Кальцоне с курицей и грибами',                      495,  true, 25),
    (v_store_id, cat_id, 'Пицца с щечками и вешенками с бортиками',           490,  true, 20),
    (v_store_id, cat_id, 'Пицца Филадельфия с бортиками',                     610,  true, 20),
    (v_store_id, cat_id, 'Пицца с говядиной и хурмой с бортиками',            530,  true, 20),
    (v_store_id, cat_id, 'Пицца с курицей и артишоками с бортиками',          570,  true, 20),
    (v_store_id, cat_id, 'Пицца с креветками ким чи с бортиками',             590,  true, 20);

  -- ── Пицца ──────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Пицца', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Пицца 4 Сыра',            550,  true, 20),
    (v_store_id, cat_id, 'Пицца Портобелло',         590,  true, 20),
    (v_store_id, cat_id, 'Пицца Пепперони',          590,  true, 20),
    (v_store_id, cat_id, 'Пицца Маргарита',          590,  true, 20),
    (v_store_id, cat_id, 'Пицца Каприччио',          590,  true, 20),
    (v_store_id, cat_id, 'Пицца с овощами-гриль',    590,  true, 20),
    (v_store_id, cat_id, 'Пицца Перчини',            770,  true, 20),
    (v_store_id, cat_id, 'Пицца Барбекю',            770,  true, 20),
    (v_store_id, cat_id, 'Пицца Карбонара',          630,  true, 20),
    (v_store_id, cat_id, 'Пицца Гавайи',             690,  true, 20),
    (v_store_id, cat_id, 'Пицца Ди Маре',            990,  true, 25);

  -- ── Паста ──────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Паста', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Паста Помадоро',                                  350,  true, 15),
    (v_store_id, cat_id, 'Паста тальятелле Карбонара',                      430,  true, 15),
    (v_store_id, cat_id, 'Паста Качо-э-пеппе',                              430,  true, 15),
    (v_store_id, cat_id, 'Паста Спагетти с митболами и пухом пармезана',    430,  true, 15),
    (v_store_id, cat_id, 'Паста Брациолле',                                 430,  true, 15),
    (v_store_id, cat_id, 'Паста Болоньезе',                                 470,  true, 15),
    (v_store_id, cat_id, 'Паста тальятелле с курицей и грибами',            470,  true, 15),
    (v_store_id, cat_id, 'Паста Фузилли бифрагу',                           490,  true, 15),
    (v_store_id, cat_id, 'Паста Казаречче с креветками фарфалле',           530,  true, 20),
    (v_store_id, cat_id, 'Паста Ригатоне с говядиной в томатном соусе',     530,  true, 15),
    (v_store_id, cat_id, 'Паста Фрутти Ди Маре',                            530,  true, 20),
    (v_store_id, cat_id, 'Паста с говядиной в перечном соусе',              590,  true, 15),
    (v_store_id, cat_id, 'Паста Казаречче с томлеными щечками',             590,  true, 15),
    (v_store_id, cat_id, 'Лазанья мясная',                                  670,  true, 20),
    (v_store_id, cat_id, 'Лазанья мясная фрита',                            670,  true, 20);

  -- ── Блюда на огне ──────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Блюда на огне', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Котлета из трески с картофельным пюре',            690,  true, 25),
    (v_store_id, cat_id, 'Котлета из курицы с гречкой и муссом из пармезана', 550, true, 20),
    (v_store_id, cat_id, 'Строганов из 2-х видов мяса с картофельным пюре', 690,  true, 25),
    (v_store_id, cat_id, 'Бургер Цезарь',                                   690,  true, 20),
    (v_store_id, cat_id, 'Шашлык из курицы с картофелем гриль',             670,  true, 25),
    (v_store_id, cat_id, 'Шашлык из свинины с картофелем гриль',            690,  true, 25),
    (v_store_id, cat_id, 'Куриный шницель с картофелем фри',                490,  true, 20),
    (v_store_id, cat_id, 'Тальятта из курицы',                              670,  true, 20),
    (v_store_id, cat_id, 'Тальятта из говядины',                            870,  true, 25),
    (v_store_id, cat_id, 'Стейк Перчини',                                  1300,  true, 30),
    (v_store_id, cat_id, 'Тигровые креветки-гриль с рисом',                 790,  true, 20),
    (v_store_id, cat_id, 'Скумбрия на гриле',                               870,  true, 25),
    (v_store_id, cat_id, 'Утиное филе с овощами гриль',                     830,  true, 25),
    (v_store_id, cat_id, 'Телячьи щечки с мятым картофелем',                770,  true, 30),
    (v_store_id, cat_id, 'Стейк Пигнек',                                    850,  true, 30);

  -- ── Салаты ─────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Салаты', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Салат с индейкой, рукколой, томатами',            430,  true, 10),
    (v_store_id, cat_id, 'Салат с языком',                                  390,  true, 10),
    (v_store_id, cat_id, 'Салат с баклажаном',                              430,  true, 10),
    (v_store_id, cat_id, 'Салат Цезарь с цыпленком',                        530,  true, 10),
    (v_store_id, cat_id, 'Салат с тунцом',                                  470,  true, 10),
    (v_store_id, cat_id, 'Салат Цезарь с тигровой креветкой',               650,  true, 10),
    (v_store_id, cat_id, 'Салат Греческий',                                 490,  true, 10),
    (v_store_id, cat_id, 'Салат с копченым цыпленком и персиком',           530,  true, 10),
    (v_store_id, cat_id, 'Салат с семгой',                                  710,  true, 10);

  -- ── Супы ───────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Супы', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Суп Солянка',                          470,  true, 15),
    (v_store_id, cat_id, 'Суп с цыпленком',                      350,  true, 15),
    (v_store_id, cat_id, 'Суп-крем Портобелло',                  390,  true, 15),
    (v_store_id, cat_id, 'Суп Сырный',                           470,  true, 15),
    (v_store_id, cat_id, 'Суп Клэм-чаудер с морепродуктами',     590,  true, 15),
    (v_store_id, cat_id, 'Суп тыквенный',                        430,  true, 15);

  -- ── Фокачча ────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Фокачча', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Воздушная фокачча',                             80,   true, 10),
    (v_store_id, cat_id, 'Фокачча с сыром Моцарелла',                    240,  true, 10),
    (v_store_id, cat_id, 'Фокачча с чесноком и оливковым маслом',        240,  true, 10),
    (v_store_id, cat_id, 'Фокачча с сыром Пармезан',                     240,  true, 10),
    (v_store_id, cat_id, 'Фокачча с кунжутом и оливковым маслом',        240,  true, 10),
    (v_store_id, cat_id, 'Чиабатта классическая',                         80,   true, 10);

  -- ── Закуски ────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Закуски', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Мидии в Винном соусе',                 810,  true, 20),
    (v_store_id, cat_id, 'Мидии в Сливочном соусе',              810,  true, 20),
    (v_store_id, cat_id, 'Брускетта с томатами и моцареллой',    330,  true, 10),
    (v_store_id, cat_id, 'Брускетта с креветкой',                370,  true, 10),
    (v_store_id, cat_id, 'Брускетта с ростбифом',                380,  true, 10),
    (v_store_id, cat_id, 'Брускетта с лососем',                  390,  true, 10),
    (v_store_id, cat_id, 'Фритто мисто',                         570,  true, 15),
    (v_store_id, cat_id, 'Ростбиф маринованный',                 690,  true, 15),
    (v_store_id, cat_id, 'Закуска слабосоленый лосось',          790,  true, 10),
    (v_store_id, cat_id, 'Индейка тоннато',                      470,  true, 10),
    (v_store_id, cat_id, 'Язык с вареньем из перца',             470,  true, 10),
    (v_store_id, cat_id, 'Капрезе',                              590,  true, 10),
    (v_store_id, cat_id, 'Сыр Дор Блю с манговым чатни',        190,  true, 5),
    (v_store_id, cat_id, 'Сыр Пармезан с медом',                190,  true, 5);

  -- ── Десерты ────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Десерты', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Крепвиль',                 560,  true, 10),
    (v_store_id, cat_id, 'Крепвиль Шоколадный',      560,  true, 10),
    (v_store_id, cat_id, 'Вишневая лазанья',          450,  true, 10),
    (v_store_id, cat_id, 'Лимончелло тирамису',       430,  true, 10),
    (v_store_id, cat_id, 'Медовик',                   470,  true, 10),
    (v_store_id, cat_id, 'Тирамису',                  470,  true, 10),
    (v_store_id, cat_id, 'Десерт томат',              570,  true, 10);

  -- ── Детское меню ───────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Детское меню', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Куриная котлета с картофельным пюре',    300,  true, 15),
    (v_store_id, cat_id, 'Суп Сырный детский',                     270,  true, 10),
    (v_store_id, cat_id, 'Хрустящий цыпленок с картофелем фри',    330,  true, 15),
    (v_store_id, cat_id, 'Суп Куриный детский',                    190,  true, 10),
    (v_store_id, cat_id, 'Паста Джузеппе',                         290,  true, 12),
    (v_store_id, cat_id, 'Паста Прошутто',                         280,  true, 12),
    (v_store_id, cat_id, 'Пицца Пепперони детская',                310,  true, 15),
    (v_store_id, cat_id, 'Салат Оливье детский',                   170,  true, 5),
    (v_store_id, cat_id, 'Паста Селестиа',                         310,  true, 12),
    (v_store_id, cat_id, 'Пицца Маргарита детская',                270,  true, 15),
    (v_store_id, cat_id, 'Салат Овощной детский',                  170,  true, 5),
    (v_store_id, cat_id, 'Пицца Гавайская детская',                350,  true, 15),
    (v_store_id, cat_id, 'Паста Твити',                            180,  true, 12),
    (v_store_id, cat_id, 'Пицца с шоколадом и маршмеллоу',         370,  true, 15),
    (v_store_id, cat_id, 'Мини-кальцоне с курицей',                295,  true, 15),
    (v_store_id, cat_id, 'Мини-кальцоне с фаршем',                 295,  true, 15),
    (v_store_id, cat_id, 'Мини-кальцоне с пепперони',              295,  true, 15),
    (v_store_id, cat_id, 'Мини-кальцоне с ветчиной',               295,  true, 15),
    (v_store_id, cat_id, 'Омлет запеченный',                       180,  true, 10),
    (v_store_id, cat_id, 'Ассорти овощных палочек',                170,  true, 5),
    (v_store_id, cat_id, 'Ассорти фруктовых долек',                190,  true, 5);

  -- ── Гарниры ────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Гарниры', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Картофель фри',                          290,  true, 10),
    (v_store_id, cat_id, 'Овощи-гриль',                            380,  true, 10),
    (v_store_id, cat_id, 'Картофельное пюре',                      160,  true, 10),
    (v_store_id, cat_id, 'Дикий и белый рис со сливками',          190,  true, 10),
    (v_store_id, cat_id, 'Картофель гриль',                        220,  true, 10),
    (v_store_id, cat_id, 'Свежие овощи',                           310,  true, 5);

  -- ── Напитки ────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Напитки', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Сок Rich апельсин',  249,  true, 0),
    (v_store_id, cat_id, 'Сок Rich ананас',    249,  true, 0),
    (v_store_id, cat_id, 'Сок Rich персик',    249,  true, 0),
    (v_store_id, cat_id, 'Сок Rich яблоко',    249,  true, 0),
    (v_store_id, cat_id, 'Сок Rich вишня',     249,  true, 0);

  -- ── Завтраки до 14:00 ──────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Завтраки до 14:00', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Каша овсяная с маслом',                           160,  true, 10),
    (v_store_id, cat_id, 'Каша рисовая с маслом на кокосовом молоке',       170,  true, 10),
    (v_store_id, cat_id, 'Скрэмбл с пармезаном',                            190,  true, 10),
    (v_store_id, cat_id, 'Скрэмбл с лососем',                               570,  true, 10),
    (v_store_id, cat_id, 'Яичница с колбасками и фасолью BBQ',              590,  true, 10);

  -- ── Комбо ──────────────────────────────────────────────────────
  INSERT INTO public.categories (name, store_id) VALUES ('Комбо', v_store_id) RETURNING id INTO cat_id;
  INSERT INTO public.menu_items (store_id, category_id, name, price, is_available, preparation_time) VALUES
    (v_store_id, cat_id, 'Суп Сырный + пицца',                    880,  true, 25),
    (v_store_id, cat_id, 'Салат с тунцом + паста',                820,  true, 20),
    (v_store_id, cat_id, 'Салат с баклажаном + паста',            880,  true, 20),
    (v_store_id, cat_id, 'Суп с цыпленком + салат + фокачча',     920,  true, 20),
    (v_store_id, cat_id, 'Суп Сырный + салат + фокачча',          990,  true, 20),
    (v_store_id, cat_id, 'Комбо Дуэт',                           1290,  true, 25),
    (v_store_id, cat_id, 'Комбо Итальянская классика',           1450,  true, 25),
    (v_store_id, cat_id, 'Комбо Пицца пати',                     2290,  true, 30),
    (v_store_id, cat_id, 'Комбо Три бортика',                    1090,  true, 25),
    (v_store_id, cat_id, 'Комбо Три хита Перчини',               1890,  true, 30);

  RAISE NOTICE 'Done. Store Перчини: %', v_store_id;
END $$;
