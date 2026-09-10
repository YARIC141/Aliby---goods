-- КБЖУ и вес порции для позиций меню. Заполняется владельцем в админке,
-- показывается покупателю в карточке товара. Все поля необязательные —
-- у услуг, аренды и непищевых товаров они просто остаются пустыми.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS portion_g INTEGER CHECK (portion_g IS NULL OR portion_g > 0),
  ADD COLUMN IF NOT EXISTS calories  NUMERIC(6,1) CHECK (calories IS NULL OR calories >= 0),
  ADD COLUMN IF NOT EXISTS protein   NUMERIC(6,1) CHECK (protein  IS NULL OR protein  >= 0),
  ADD COLUMN IF NOT EXISTS fat       NUMERIC(6,1) CHECK (fat      IS NULL OR fat      >= 0),
  ADD COLUMN IF NOT EXISTS carbs     NUMERIC(6,1) CHECK (carbs    IS NULL OR carbs    >= 0);
