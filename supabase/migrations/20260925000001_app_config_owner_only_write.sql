-- ============================================================
-- app_config: запись только владельцем платформы, не любым admin
-- is_admin() истинен для владельца ЛЮБОГО заведения — это давало
-- любому админу возможность переписать глобальный конфиг (в т.ч.
-- feature-флаги навигации), который видят ВСЕ покупатели платформы.
-- ============================================================

DROP POLICY IF EXISTS "app_config_write_admin" ON public.app_config;

CREATE POLICY "app_config_write_owner" ON public.app_config
  FOR ALL USING (is_platform_owner()) WITH CHECK (is_platform_owner());

CREATE OR REPLACE FUNCTION public.set_app_config(p_scope TEXT, p_config JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_platform_owner() THEN
    RAISE EXCEPTION 'Access denied: platform owner only';
  END IF;
  IF p_scope NOT IN ('client', 'admin') THEN
    RAISE EXCEPTION 'scope must be ''client'' or ''admin''';
  END IF;
  INSERT INTO public.app_config(scope, config, updated_at)
  VALUES (p_scope, p_config, now())
  ON CONFLICT (scope) DO UPDATE
    SET config = EXCLUDED.config, updated_at = EXCLUDED.updated_at;
  RETURN p_config;
END; $$;
