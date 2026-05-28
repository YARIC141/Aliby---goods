-- Allow store owners (not just platform admins) to upload/update/delete
-- photos in the menu-photos bucket for their own stores.

CREATE POLICY "menu-photos: owner upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'menu-photos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "menu-photos: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'menu-photos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE owner_user_id = auth.uid()
    )
  );

CREATE POLICY "menu-photos: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'menu-photos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.stores
      WHERE owner_user_id = auth.uid()
    )
  );
