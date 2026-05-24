# CJM — Административное приложение Alliby

## Обзор

Админка — инструмент менеджера заведений: управление заведениями, меню, категориями, абонементами, сканирование QR при списании.

---

## Точки входа

| Вход | Условие | Куда ведёт |
|------|---------|-----------|
| Открытие приложения | Нет сессии (`alliby_admin_s` пуст) | → Экран авторизации |
| Открытие приложения | Есть сессия, есть `alliby_nav` | → Последний экран |
| Открытие приложения | Есть сессия, нет `alliby_nav` | → Заведения (`screen-stores`) |
| После сброса пароля | По ссылке из письма | → Вкладка «Сброс пароля» |

---

## Экраны

### 1. Авторизация (`screen-auth`)

**Вкладки:** Войти / Восстановить пароль / Сброс пароля

#### Войти
```
Ввод email + пароль
  → [Войти]
      POST /auth/v1/token?grant_type=password
      ├── Успех → GET /rest/v1/profiles?id=eq.{uid}
      │     ├── role === 'admin' → сохранить сессию → goTo('stores')
      │     └── role !== 'admin' → «Нет доступа» → logout
      └── Ошибка → сообщение об ошибке
```

#### Восстановление пароля
```
Ввод email
  → [Отправить]
      POST /auth/v1/recover?redirect_to=/admin/
      └── Успех → уведомление об отправке письма
```

#### Сброс пароля
```
Ввод нового пароля (открывается по ссылке из письма)
  → [Сохранить]
      PUT /auth/v1/user
      └── Успех → вкладка «Войти»
```

---

### 2. Заведения (`screen-stores`)

**Данные:** GET /rest/v1/stores + GET /rest/v1/rpc/get_stores_with_locations

```
Открытие экрана
  → loadStores()
      ├── Отображение карточек заведений
      │     Каждая карточка содержит: цветная точка, название, адрес, часы, телефон
      │
      ├── [+ Добавить] → openStoreModal()
      │     ──► Модал «Заведение» (m-store) — режим создания
      │
      ├── Карточка → [Ред.] → openStoreModal(store)
      │     ──► Модал «Заведение» (m-store) — режим редактирования
      │
      ├── Карточка → [📍 Карта] → showOnMap(store)
      │     → S.mapViewStore = store
      │     → goTo('map')  ──► Экран карты (режим просмотра)
      │
      └── Карточка → [Удал.] → confirmDelete('store', id, name)
            ──► Модал «Подтверждение удаления»
```

#### Модал «Заведение» (`m-store`)

**Режим создания:**
```
openStoreModal() — все поля пустые
  → Заполнить: название*, адрес*, категория, телефон, часы работы, цвет маркера
  → [Указать на карте] → pickOnMap()
  │     → сохранить черновик формы в S.storeFormDraft
  │     → goTo('map')  ──► Экран карты (режим выбора координат)
  │           Клик на карту → S.mapPickCoords = {lat, lng}
  │           [Использовать это место] → usePickedCoords()
  │                 → вернуть координаты в форму → goTo('stores') → openStoreModal()
  │           [Отмена] → cancelPickMode() → goTo('stores') → openStoreModal()
  │
  → [Сохранить] → saveStore()
        POST /rest/v1/stores
        POST /rest/v1/rpc/upsert_store_location (если есть координаты)
        ├── Успех → closeModal → loadStores()
        └── Ошибка → alert
```

**Режим редактирования:**
```
openStoreModal(store) — поля заполнены из объекта store
  → [Те же поля + те же действия]
  → [Сохранить] → saveStore()
        PATCH /rest/v1/stores?id=eq.{id}
        POST /rest/v1/rpc/upsert_store_location
        ├── Успех → closeModal → loadStores()
        └── Ошибка → alert
```

---

### 3. Категории (`screen-categories`)

**Данные:** GET /rest/v1/categories (с фильтром по заведению)

```
Открытие экрана
  → loadCategories()
      ├── [Фильтр по заведению] → onchange → loadCategories()
      │
      ├── [+ Добавить] → openCatModal()
      │     ──► Модал «Категория» (m-cat) — режим создания
      │
      ├── Строка таблицы → [Ред.] → openCatModal(cat)
      │     ──► Модал «Категория» (m-cat) — режим редактирования
      │
      └── Строка таблицы → [Удал.] → confirmDelete('cat', id, name)
            ──► Модал «Подтверждение удаления»
```

#### Модал «Категория» (`m-cat`)
```
openCatModal([cat])
  → Поля: название*, заведение (пусто = глобальная)
  → [Сохранить] → saveCat()
        id ? PATCH /rest/v1/categories?id=eq.{id}
           : POST /rest/v1/categories
        ├── Успех → closeModal → loadCategories()
        └── Ошибка → alert
  └── [Отмена] → closeModal('m-cat')
```

---

### 4. Меню (`screen-menu`)

**Данные:** GET /rest/v1/menu_items (с фильтрами)

```
Открытие экрана
  → loadMenuItems()
      ├── ФИЛЬТРЫ
      │     ├── [Заведение] → onchange → loadMenuItems()
      │     ├── [Категория] → onchange → loadMenuItems()
      │     └── [Поиск по названию] → oninput → loadMenuItems()
      │
      ├── [+ Добавить] → openMenuItemModal()
      │     ──► Модал «Позиция меню» (m-mi) — режим создания
      │
      ├── Строка таблицы → [Ред.] → openMenuItemModal(item)
      │     ──► Модал «Позиция меню» (m-mi) — режим редактирования
      │
      └── Строка таблицы → [Удал.] → confirmDelete('mi', id, name)
            ──► Модал «Подтверждение удаления»
```

#### Модал «Позиция меню» (`m-mi`)
```
openMenuItemModal([item])
  → Поля: заведение*, категория*, название*, описание, цена*, в наличии (чекбокс)
  │
  ├── УПРАВЛЕНИЕ ФОТО
  │     ├── [Выбрать файл] → previewPhoto(file)
  │     │     → показать превью локально
  │     ├── [Загрузить фото] → uploadPhoto()
  │     │     POST /storage/v1/object/menu-photos/{uuid_filename}
  │     │     ├── Успех → сохранить S.uploadedPhotoFilename → показать превью
  │     │     └── Ошибка → alert
  │     └── [Удалить фото] → deletePhoto()
  │           DELETE /storage/v1/object/menu-photos/{filename}
  │           └── Успех → очистить превью
  │
  → [Сохранить] → saveMenuItem()
        id ? PATCH /rest/v1/menu_items?id=eq.{id}
           : POST /rest/v1/menu_items
        ├── Успех → closeModal → loadMenuItems()
        └── Ошибка → alert
  └── [Отмена] → closeModal('m-mi')
```

---

### 5. Абонементы (`screen-subscriptions`)

**Данные:** GET /rest/v1/subscriptions?select=*,stores(name) (с фильтром по заведению)

```
Открытие экрана
  → loadSubscriptions()
      ├── Таблица: Название | Заведение | Цена | Скидка | Срок | Исп.
      │
      ├── [Фильтр по заведению] → onchange → loadSubscriptions()
      │
      ├── [+ Добавить] → openSubModal()
      │     ──► Модал «Абонемент» (m-sub) — режим создания
      │
      ├── Строка → [Ред.] → openSubModal(sub)
      │     ──► Модал «Абонемент» (m-sub) — режим редактирования
      │
      └── Строка → [Удал.] → confirmDelete('sub', id, name)
            ──► Модал «Подтверждение удаления»
```

#### Модал «Абонемент» (`m-sub`)
```
openSubModal([sub])
  → ОСНОВНЫЕ ПОЛЯ
  │   ├── Заведение* → onchange → onSubStoreChange() → загрузить товары заведения
  │   ├── Название*
  │   ├── Товар / услуга* (select, заполняется после выбора заведения)
  │   │     GET /rest/v1/menu_items?store_id=eq.{id}&order=name.asc
  │   ├── Цена абонемента* (₽)
  │   ├── Тип скидки* (% от цены / фиксированная ₽)
  │   ├── Размер скидки*
  │   ├── Срок действия* (дней)
  │   └── Всего использований (0 = безлимит)
  │
  ├── ВРЕМЕННЫЕ ОГРАНИЧЕНИЯ (time_rules)
  │   ├── Дни недели (Пн–Вс, чекбоксы)
  │   ├── Время начала (HH:MM, Москва)
  │   ├── Время окончания (HH:MM, Москва)
  │   └── Исключённые даты (ГГГГ-ММ-ДД через запятую)
  │
  ├── ЛИМИТЫ ИСПОЛЬЗОВАНИЯ (usage_limits)
  │   ├── Макс. использований в день
  │   ├── Мин. интервал между использованиями (часы)
  │   └── Мин. сумма заказа (₽)
  │
  → ВАЛИДАЦИЯ (saveSubscription)
  │   ├── Заведение не выбрано → «Выберите заведение»
  │   ├── Название пустое → «Введите название абонемента»
  │   ├── Товар не выбран → «Выберите товар или услугу»
  │   ├── Цена ≤ 0 → «Введите цену абонемента»
  │   ├── Скидка ≤ 0 → «Введите размер скидки»
  │   └── Срок ≤ 0 → «Введите срок действия в днях»
  │
  → [Сохранить] → saveSubscription()
  │     coverage_rules = {type:'include_items', item_ids:[itemId]}
  │     id ? PATCH /rest/v1/subscriptions?id=eq.{id}
  │        : POST /rest/v1/subscriptions
  │     ├── Успех → closeModal → loadSubscriptions()
  │     └── Ошибка → alert
  └── [Отмена] → closeModal('m-sub')
```

---

### 6. Карта (`screen-map`)

Карта имеет два режима работы в зависимости от того, как она открыта.

#### Режим просмотра (через «Показать на карте»)
```
showOnMap(store)
  → S.mapViewStore = store → goTo('map')
  → loadMapAdmin()
      ├── Инициализация MapLibre
      ├── GET /rest/v1/rpc/get_stores_with_locations
      │     → отрисовать маркеры всех заведений
      │     → если S.mapViewStore → flyTo(store.lat, store.lng)
      │
      └── [← Заведения] → goTo('stores')  ──► Экран заведений
```

#### Режим выбора координат (через «Указать на карте»)
```
pickOnMap(storeId, draft)
  → S.mapPickMode = true → S.storeFormDraft = draft → goTo('map')
  → на карте появляется курсор
      │
      ├── Клик по карте
      │     → S.mapPickCoords = {lat, lng}
      │     → поставить временный маркер
      │
      ├── [Использовать это место] → usePickedCoords()
      │     → восстановить черновик формы
      │     → восстановить цвет маркера из черновика
      │     → goTo('stores') → openStoreModal() с координатами
      │
      └── [Отмена] → cancelPickMode()
            → S.mapPickMode = false → S.mapPickCoords = null
            → удалить временный маркер
            → goTo('stores') → openStoreModal() без координат
```

---

### 7. QR-сканер (`screen-qr`)

**Назначение:** Сканировать QR-код клиента и списать использование абонемента.

```
Открытие экрана
  → loadQrScreen()
      │
      ├── СКАНИРОВАНИЕ КАМЕРОЙ
      │     ├── [▶ Запустить камеру] → startQrCamera()
      │     │     → navigator.mediaDevices.getUserMedia({video: true})
      │     │     → запустить видео + polling каждые 200мс через Canvas + jsQR
      │     │           ├── QR распознан → onQrResult(userId)
      │     │           │     → GET /rest/v1/rpc/get_user_subscriptions?uid={userId}
      │     │           │     ├── Найдены абонементы → показать список
      │     │           │     │     Клик на абонемент → openRedeemModal(usub)
      │     │           │     │           ──► Модал «Списание» (m-redeem)
      │     │           │     └── Нет абонементов → «Нет активных абонементов»
      │     │           └── Нет QR → продолжить сканирование
      │     └── [⏹ Остановить] → stopQrCamera()
      │           → остановить все видеодорожки
      │
      ├── РУЧНОЙ ПОИСК
      │     ├── Ввод UUID пользователя
      │     └── [Найти] → manualLookup()
      │           GET /rest/v1/rpc/get_user_subscriptions?uid={input}
      │           ├── Найдены → список абонементов → openRedeemModal(usub)
      │           └── Не найдены → «Не найдено»
      │
      └── [← Выход] → stopQrCamera() + goTo('stores')
```

#### Модал «Списание» (`m-redeem`)
```
openRedeemModal(usub)
  → показать: имя абонемента, статус, остаток использований
  → Ввод количества (1–20, default = 1)
  → [Подтвердить списание] → confirmRedeem()
        POST /rest/v1/rpc/redeem_subscription
        { user_sub_id, quantity, redemption_date: now() }
        ├── Успех → обновить список → уведомление → closeModal
        └── Ошибка → alert
  └── [Отмена] → closeModal('m-redeem')
```

---

### 8. Профиль (`screen-profile`)

**Данные:** GET /auth/v1/user + GET /rest/v1/profiles?id=eq.{uid}

```
Открытие экрана
  → loadProfile()
      │
      ├── АККАУНТ
      │     ├── Отображение email, UUID, роли (admin)
      │     └── [Изменить пароль] → updatePwd()
      │           PUT /auth/v1/user
      │           ├── Успех → уведомление
      │           └── Ошибка → alert
      │
      ├── НАСТРОЙКИ ИНТЕРФЕЙСА
      │     ├── [Тёмная/светлая тема] → toggleTheme()
      │     │     → localStorage alliby_theme
      │     └── [Позиция меню] (мобайл) → toggleNavPos()
      │           → localStorage alliby_admin_nav_pos
      │
      └── АККАУНТ (опасные действия)
            ├── [Выйти] → doLogout()
            │     POST /auth/v1/logout
            │     └── Очистить localStorage → goTo('auth')
            └── [Удалить аккаунт] → doDeleteAccount()
                  POST /functions/v1/delete-account
                  └── Очистить localStorage → goTo('auth')
```

---

### 9. Модал «Подтверждение удаления» (`m-confirm`)

Используется для заведений, категорий, позиций меню, абонементов.

```
confirmDelete(type, id, name)
  → S.pendingConfirm = {type, id}
  → показать: «Удалить [name]?»
  → [Подтвердить] → confirmAction()
        paths = {
          store: DELETE /rest/v1/stores?id=eq.{id},
          cat:   DELETE /rest/v1/categories?id=eq.{id},
          mi:    DELETE /rest/v1/menu_items?id=eq.{id},
          sub:   DELETE /rest/v1/subscriptions?id=eq.{id}
        }
        ├── Успех → closeModal → перезагрузить текущий экран
        └── Ошибка → alert
  └── [Отмена] → closeModal('m-confirm')
```

---

## Полная карта переходов между экранами

```
                    ┌─────────────────────────────────────────────┐
                    │               Вход в приложение              │
                    └─────────────────────────────────────────────┘
                                         │
                        ┌────────────────┴────────────────┐
                        │ Нет сессии /                    │ Есть сессия
                        │ role != admin                   │ role == admin
                        ▼                                 ▼
                  [screen-auth]                  [Последний экран]
                        │                        или [screen-stores]
              Успешный вход (admin)
                        │
                        ▼
              [screen-stores] ◄──────────────────────────────────────────┐
                    │    │                                               │
                    │  [Показать на карте]                               │
                    │    │                                               │
                    │    └──► [screen-map] ──── [← Заведения] ──────────┤
                    │             ▲                                      │
                    │        [Указать на карте]                          │
                    │        (из m-store)                                │
                    │             │                                      │
                    │        Использовать/Отмена ─────────────────► m-store
                    │                                                    │
    ┌───────────────┼────────────────────────────────────┐              │
    │               │                                    │              │
    ▼               ▼               ▼                    ▼              │
[screen-categories][screen-menu][screen-subscriptions][screen-qr]       │
         │              │               │                 │             │
       m-cat          m-mi           m-sub          m-redeem            │
         │              │               │                               │
    saveCat()    saveMenuItem()  saveSubscription()   confirmRedeem()    │
         │              │               │                               │
    loadCats()   loadMenu()    loadSubscriptions() ◄───────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │                  Боковое/нижнее меню                         │
  │                                                              │
  │  [Заведения] [Категории] [Меню] [Абонементы] [QR] [Профиль] │
  │      │           │         │         │         │       │     │
  │   screen-   screen-    screen-   screen-   screen-  screen-  │
  │   stores   categories  menu  subscriptions   qr    profile   │
  └──────────────────────────────────────────────────────────────┘
```

---

## Жизненный цикл абонемента (полный путь)

```
АДМИНИСТРАТОР                              КЛИЕНТ

[screen-subscriptions]
  → openSubModal()
  → Выбрать заведение, товар, скидку
  → saveSubscription()
      POST /rest/v1/subscriptions
                │
                │ Абонемент создан в БД
                ▼
[screen-stores, screen-menu]            [screen-store]
  Абонемент виден в таблице               → Карточка абонемента в store-subs
                                          → Хинт «Абонемент: X ₽» на товаре
                                          → openSubDetailModal()
                                          → [Купить →]
                                              POST /rest/v1/user_subscriptions
                                              status='active'
                                                │
                                                │ Куплен → goTo('cart')
                                                │ Зелёная цена в корзине
                                                │ Зелёная цена в menu
                                                ▼
[screen-qr]                             [screen-subscriptions]
  → startQrCamera()                       → QR-код пользователя
  → Сканировать QR                        → [показать QR]
  → onQrResult(userId)                         ▲
  → openRedeemModal(usub)                      │
  → confirmRedeem()                            │ (клиент показывает QR)
      POST rpc/redeem_subscription             │
      remaining_uses -= qty               [Оформление заказа]
                                          → checkoutSubs() или placeOrder()
```

---

## localStorage: сохраняемое состояние

| Ключ | Содержимое | Когда сохраняется |
|------|-----------|------------------|
| `alliby_admin_s` | JWT сессия + refresh token | При входе |
| `alliby_nav` | ID последнего экрана | При каждом переходе |
| `alliby_theme` | `'dark'` / `'light'` | При смене темы |
| `alliby_admin_nav_pos` | `'right'` / `'bottom'` | При смене позиции меню |

---

## Граничные случаи и обработка ошибок

| Ситуация | Обработка |
|---------|----------|
| Вход не-администратора | Logout + «Нет доступа» |
| Сохранение абонемента с пустым названием | Валидация → «Введите название» |
| Сохранение абонемента без товара | Валидация → «Выберите товар или услугу» |
| Сохранение абонемента со скидкой 0 | Валидация → «Введите размер скидки» |
| Удаление заведения с товарами | Зависит от FK в БД (cascade или ошибка) |
| Фото не загружено перед сохранением | Сохраняется без фото |
| Камера QR недоступна | Предложить ручной ввод |
| Пользователь не найден по UUID | «Не найдено» |
| Абонемент у пользователя исчерпан | remaining_uses = 0, кнопка недоступна |
| Координаты не выбраны при сохранении | Заведение сохраняется без локации |
| Фильтр по заведению — пусто | Показать все записи |
