-- ============================================================
-- Миграция 7: Таблицы карты и геометок
-- ============================================================

CREATE TABLE public.maps (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT          NOT NULL,
  mime_type    TEXT          NOT NULL DEFAULT 'image/png',
  width        INTEGER       NOT NULL,
  height       INTEGER       NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE public.markers (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id     UUID          NOT NULL REFERENCES public.maps(id)   ON DELETE CASCADE,
  store_id   UUID          NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  x          NUMERIC(10,2) NOT NULL,
  y          NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE public.maps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maps_select_all"    ON public.maps    FOR SELECT USING (true);
CREATE POLICY "markers_select_all" ON public.markers FOR SELECT USING (true);

CREATE POLICY "maps_insert_admin"    ON public.maps    FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "maps_delete_admin"    ON public.maps    FOR DELETE USING (is_admin());
CREATE POLICY "markers_insert_admin" ON public.markers FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "markers_delete_admin" ON public.markers FOR DELETE USING (is_admin());

-- Бакет для хранения растровой карты (публичный на чтение)
INSERT INTO storage.buckets (id, name, public)
VALUES ('maps', 'maps', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "maps_bucket_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'maps');

COMMENT ON TABLE public.maps    IS 'Единственная растровая карта заведений';
COMMENT ON TABLE public.markers IS 'Геометки на карте, привязанные к заведениям';
COMMENT ON COLUMN public.markers.x IS 'Пикселей от левого края (ось X вправо)';
COMMENT ON COLUMN public.markers.y IS 'Пикселей от нижнего края (ось Y вверх)';
