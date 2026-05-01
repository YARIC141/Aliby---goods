-- ============================================================
-- Миграция 5: Supabase Storage — бакет menu-photos
-- ============================================================

-- Создаём публичный бакет для фотографий меню
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-photos',
  'menu-photos',
  true,                                              -- публичный: URL доступны без авторизации
  5242880,                                           -- 5 МБ на файл
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---- RLS-политики для storage.objects ----------------------

-- Публичное чтение — все видят фотографии без авторизации
CREATE POLICY "menu-photos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-photos');

-- Загрузка — только admin
CREATE POLICY "menu-photos: admin upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'menu-photos'
    AND public.is_admin()
  );

-- Обновление — только admin
CREATE POLICY "menu-photos: admin update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'menu-photos'
    AND public.is_admin()
  );

-- Удаление — только admin
CREATE POLICY "menu-photos: admin delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'menu-photos'
    AND public.is_admin()
  );
