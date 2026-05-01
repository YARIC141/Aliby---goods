-- ============================================================
-- App Config: per-scope (client / admin) JSON configuration
-- Controls vector map zoom thresholds, colors, UI feature flags
-- ============================================================

CREATE TABLE public.app_config (
  scope      TEXT        PRIMARY KEY CHECK (scope IN ('client', 'admin')),
  config     JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config_read_all"   ON public.app_config FOR SELECT USING (true);
CREATE POLICY "app_config_write_admin" ON public.app_config
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Full-replace RPC (admin only)
CREATE OR REPLACE FUNCTION public.set_app_config(p_scope TEXT, p_config JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
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

-- ── Seed default client config ─────────────────────────────────
INSERT INTO public.app_config(scope, config) VALUES ('client', '{
  "vectorMap": {
    "tileSource": { "minzoom": 8, "maxzoom": 16 },
    "layers": {
      "water":     { "minzoom": 0  },
      "land_use":  { "minzoom": 10 },
      "roads":     { "minzoom": 8  },
      "buildings": { "minzoom": 13 },
      "places":    { "minzoom": 14 },
      "addresses": { "minzoom": 17 }
    },
    "labels": {
      "roads":     { "minzoom": 14, "fontSize": 11 },
      "buildings": { "minzoom": 16, "fontSize": 10 },
      "addresses": { "minzoom": 17, "fontSize": 10 },
      "places":    { "minzoom": 15, "fontSize": 10 }
    },
    "colors": {
      "background":    "#f0ede8",
      "water":         "#9ecfdf",
      "waterStroke":   "#7ab8cc",
      "park":          "#b8d8b8",
      "residential":   "#f5f0e8",
      "buildingFill":  "#e8e0d4",
      "buildingLine":  "#c8bfb0",
      "motorway":      "#e8a020",
      "primaryRoadBg": "#c0b8a8",
      "primaryRoad":   "#ffffff",
      "tertiaryRoad":  "#ffffff",
      "path":          "#c8b898"
    }
  },
  "ui": {
    "features": {
      "sMap":             true,
      "sVectorMap":       true,
      "sStores":          true,
      "sMenu":            true,
      "sCart":            true,
      "sOrders":          true,
      "sSubscriptions":   true,
      "sMySubscriptions": true
    }
  }
}') ON CONFLICT DO NOTHING;

-- ── Seed default admin config ──────────────────────────────────
INSERT INTO public.app_config(scope, config) VALUES ('admin', '{
  "vectorMap": {
    "tileSource": { "minzoom": 8, "maxzoom": 16 },
    "layers": {
      "water":     { "minzoom": 0  },
      "land_use":  { "minzoom": 10 },
      "roads":     { "minzoom": 8  },
      "buildings": { "minzoom": 13 },
      "places":    { "minzoom": 14 },
      "addresses": { "minzoom": 17 }
    },
    "labels": {
      "roads":     { "minzoom": 14, "fontSize": 11 },
      "buildings": { "minzoom": 16, "fontSize": 10 },
      "addresses": { "minzoom": 17, "fontSize": 10 },
      "places":    { "minzoom": 15, "fontSize": 10 }
    },
    "colors": {
      "background":    "#f0ede8",
      "water":         "#9ecfdf",
      "waterStroke":   "#7ab8cc",
      "park":          "#b8d8b8",
      "residential":   "#f5f0e8",
      "buildingFill":  "#e8e0d4",
      "buildingLine":  "#c8bfb0",
      "motorway":      "#e8a020",
      "primaryRoadBg": "#c0b8a8",
      "primaryRoad":   "#ffffff",
      "tertiaryRoad":  "#ffffff",
      "path":          "#c8b898"
    }
  },
  "ui": {
    "features": {
      "sStores":        true,
      "sCategories":    true,
      "sMenu":          true,
      "sSubscriptions": true,
      "sOrders":        true,
      "sMap":           true,
      "sVectorMap":     true
    }
  }
}') ON CONFLICT DO NOTHING;
