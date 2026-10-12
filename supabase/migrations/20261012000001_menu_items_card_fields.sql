-- Поля карточки позиции: «Что входит в услугу» (пункты через перенос строки),
-- «Состав» и флаг «Новинка». Заполняются в админке, показываются в карточке клиента.
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS includes    TEXT,
  ADD COLUMN IF NOT EXISTS composition TEXT,
  ADD COLUMN IF NOT EXISTS is_new      BOOLEAN NOT NULL DEFAULT false;
NOTIFY pgrst, 'reload schema';
