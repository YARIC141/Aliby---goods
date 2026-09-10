-- Ручной порядок отображения позиций меню (внутри категории).
-- default 0 у всех строк = сортировка не меняется, пока владелец не начнёт двигать стрелками.
alter table public.menu_items
  add column if not exists sort_order integer not null default 0;
