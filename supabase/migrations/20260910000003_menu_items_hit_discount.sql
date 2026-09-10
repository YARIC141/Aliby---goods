-- Плашки "Хит" и "Скидка" на товаре (menu_items), задаются владельцем
-- заведения в админке: is_hit — булев флаг, old_price — цена до скидки
-- (показывается на клиенте зачёркнутой рядом с текущей price).
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_hit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS old_price NUMERIC(10,2) CHECK (old_price IS NULL OR old_price >= 0);
