-- vector_map schema and all map data tables.
-- Created manually in cloud; this migration makes it reproducible locally.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS vector_map;

GRANT USAGE ON SCHEMA vector_map TO anon, authenticated, service_role;

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vector_map.vm_water (
  id      TEXT    PRIMARY KEY,
  geom    geometry(Geometry, 4326) NOT NULL,
  name    TEXT,
  subtype TEXT,
  class   TEXT
);

CREATE TABLE IF NOT EXISTS vector_map.vm_land_use (
  id      TEXT    PRIMARY KEY,
  geom    geometry(Geometry, 4326) NOT NULL,
  subtype TEXT,
  class   TEXT,
  surface TEXT
);

CREATE TABLE IF NOT EXISTS vector_map.vm_roads (
  id      TEXT    PRIMARY KEY,
  geom    geometry(Geometry, 4326) NOT NULL,
  name    TEXT,
  class   TEXT,
  subtype TEXT,
  surface TEXT,
  oneway  BOOLEAN
);

CREATE TABLE IF NOT EXISTS vector_map.vm_buildings (
  id      TEXT    PRIMARY KEY,
  geom    geometry(Geometry, 4326) NOT NULL,
  name    TEXT,
  subtype TEXT,
  class   TEXT,
  floors  INTEGER,
  height  DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS vector_map.vm_places (
  id         TEXT    PRIMARY KEY,
  geom       geometry(Point, 4326) NOT NULL,
  name       TEXT,
  category   TEXT,
  confidence DOUBLE PRECISION,
  website    TEXT,
  phone      TEXT
);

CREATE TABLE IF NOT EXISTS vector_map.store_locations (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID      NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  geom         geometry(Point, 4326) NOT NULL,
  marker_color TEXT      NOT NULL DEFAULT '#e8430a',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ── GIST indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS vm_water_geom_idx       ON vector_map.vm_water       USING GIST (geom);
CREATE INDEX IF NOT EXISTS vm_land_use_geom_idx    ON vector_map.vm_land_use    USING GIST (geom);
CREATE INDEX IF NOT EXISTS vm_roads_geom_idx       ON vector_map.vm_roads       USING GIST (geom);
CREATE INDEX IF NOT EXISTS vm_buildings_geom_idx   ON vector_map.vm_buildings   USING GIST (geom);
CREATE INDEX IF NOT EXISTS vm_places_geom_idx      ON vector_map.vm_places      USING GIST (geom);
CREATE INDEX IF NOT EXISTS store_locations_geom_idx ON vector_map.store_locations USING GIST (geom);

-- ── Grants on tables ─────────────────────────────────────────────────────────

GRANT SELECT ON vector_map.vm_water       TO anon, authenticated;
GRANT SELECT ON vector_map.vm_land_use    TO anon, authenticated;
GRANT SELECT ON vector_map.vm_roads       TO anon, authenticated;
GRANT SELECT ON vector_map.vm_buildings   TO anon, authenticated;
GRANT SELECT ON vector_map.vm_places      TO anon, authenticated;
GRANT SELECT ON vector_map.store_locations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON vector_map.store_locations TO authenticated;
GRANT ALL ON vector_map.vm_water, vector_map.vm_land_use, vector_map.vm_roads,
             vector_map.vm_buildings, vector_map.vm_places, vector_map.store_locations
  TO service_role;

-- ── Import functions ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.import_vm_water(features JSONB)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER AS $$
  WITH ins AS (
    INSERT INTO vector_map.vm_water (id, geom, name, subtype, class)
    SELECT
      coalesce(feat->>'id', gen_random_uuid()::text),
      ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(feat->'geometry'), 4326)),
      feat->>'name', feat->>'subtype', feat->>'class'
    FROM jsonb_array_elements(features) feat
    WHERE feat->'geometry' IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      geom=EXCLUDED.geom, name=EXCLUDED.name, subtype=EXCLUDED.subtype
    RETURNING 1
  ) SELECT count(*)::INTEGER FROM ins;
$$;

CREATE OR REPLACE FUNCTION public.import_vm_land_use(features JSONB)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER AS $$
  WITH ins AS (
    INSERT INTO vector_map.vm_land_use (id, geom, subtype, class, surface)
    SELECT
      coalesce(feat->>'id', gen_random_uuid()::text),
      ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(feat->'geometry'), 4326)),
      feat->>'subtype', feat->>'class', feat->>'surface'
    FROM jsonb_array_elements(features) feat
    WHERE feat->'geometry' IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      geom=EXCLUDED.geom, subtype=EXCLUDED.subtype, class=EXCLUDED.class
    RETURNING 1
  ) SELECT count(*)::INTEGER FROM ins;
$$;

CREATE OR REPLACE FUNCTION public.import_vm_roads(features JSONB)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER AS $$
  WITH ins AS (
    INSERT INTO vector_map.vm_roads (id, geom, name, class, subtype, surface, oneway)
    SELECT
      coalesce(feat->>'id', gen_random_uuid()::text),
      ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(feat->'geometry'), 4326)),
      feat->>'name', feat->>'class', feat->>'subtype', feat->>'surface',
      (feat->>'oneway')::BOOLEAN
    FROM jsonb_array_elements(features) feat
    WHERE feat->'geometry' IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      geom=EXCLUDED.geom, name=EXCLUDED.name, class=EXCLUDED.class,
      subtype=EXCLUDED.subtype, surface=EXCLUDED.surface, oneway=EXCLUDED.oneway
    RETURNING 1
  ) SELECT count(*)::INTEGER FROM ins;
$$;

CREATE OR REPLACE FUNCTION public.import_vm_buildings(features JSONB)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER AS $$
  WITH ins AS (
    INSERT INTO vector_map.vm_buildings (id, geom, name, subtype, class, floors, height)
    SELECT
      coalesce(feat->>'id', gen_random_uuid()::text),
      ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(feat->'geometry'), 4326)),
      feat->>'name', feat->>'subtype', feat->>'class',
      NULLIF(feat->>'floors', '')::INTEGER,
      NULLIF(feat->>'height', '')::DOUBLE PRECISION
    FROM jsonb_array_elements(features) feat
    WHERE feat->'geometry' IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      geom=EXCLUDED.geom, name=EXCLUDED.name, subtype=EXCLUDED.subtype,
      class=EXCLUDED.class, floors=EXCLUDED.floors, height=EXCLUDED.height
    RETURNING 1
  ) SELECT count(*)::INTEGER FROM ins;
$$;

CREATE OR REPLACE FUNCTION public.import_vm_places(features JSONB)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER AS $$
  WITH ins AS (
    INSERT INTO vector_map.vm_places (id, geom, name, category, confidence, website, phone)
    SELECT
      coalesce(feat->>'id', gen_random_uuid()::text),
      ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(feat->'geometry'), 4326)),
      feat->>'name', feat->>'category',
      NULLIF(feat->>'confidence', '')::DOUBLE PRECISION,
      feat->>'website', feat->>'phone'
    FROM jsonb_array_elements(features) feat
    WHERE feat->'geometry' IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      geom=EXCLUDED.geom, name=EXCLUDED.name, category=EXCLUDED.category
    RETURNING 1
  ) SELECT count(*)::INTEGER FROM ins;
$$;

GRANT ALL ON FUNCTION public.import_vm_water(JSONB)     TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.import_vm_land_use(JSONB)  TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.import_vm_roads(JSONB)     TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.import_vm_buildings(JSONB) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.import_vm_places(JSONB)    TO anon, authenticated, service_role;
