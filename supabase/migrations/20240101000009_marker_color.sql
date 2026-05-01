-- Add per-store marker color to store_locations
ALTER TABLE vector_map.store_locations
  ADD COLUMN IF NOT EXISTS marker_color TEXT NOT NULL DEFAULT '#e8430a';

-- Drop old upsert (signature changes)
DROP FUNCTION IF EXISTS public.upsert_store_location(UUID, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE FUNCTION public.upsert_store_location(
  p_store_id UUID,
  p_lng      DOUBLE PRECISION,
  p_lat      DOUBLE PRECISION,
  p_color    TEXT DEFAULT '#e8430a'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO vector_map.store_locations(store_id, geom, marker_color)
  VALUES (p_store_id, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326), p_color)
  ON CONFLICT (store_id) DO UPDATE SET
    geom         = EXCLUDED.geom,
    marker_color = EXCLUDED.marker_color,
    updated_at   = now();

  UPDATE public.stores
  SET latitude = p_lat, longitude = p_lng
  WHERE id = p_store_id;
END; $$;

-- Update color only (no relocation)
CREATE OR REPLACE FUNCTION public.update_store_marker_color(
  p_store_id UUID,
  p_color    TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE vector_map.store_locations
  SET marker_color = p_color
  WHERE store_id = p_store_id;
END; $$;

-- Return all stores with their geotag coordinates and color
CREATE OR REPLACE FUNCTION public.get_stores_with_locations()
RETURNS TABLE(
  id            UUID,
  name          TEXT,
  address       TEXT,
  phone         TEXT,
  working_hours TEXT,
  lng           DOUBLE PRECISION,
  lat           DOUBLE PRECISION,
  marker_color  TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.name, s.address, s.phone, s.working_hours,
    ST_X(sl.geom)::DOUBLE PRECISION,
    ST_Y(sl.geom)::DOUBLE PRECISION,
    sl.marker_color
  FROM public.stores s
  LEFT JOIN vector_map.store_locations sl ON sl.store_id = s.id
  ORDER BY s.name;
END; $$;

-- Update MVT tile function to expose marker_color in stores source-layer
CREATE OR REPLACE FUNCTION vector_map.get_tile(z INT, x INT, y INT)
RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  bounds GEOMETRY;
  result bytea := ''::bytea;
  tile   bytea;
BEGIN
  bounds := ST_TileEnvelope(z, x, y);

  SELECT ST_AsMVT(q, 'water', 4096, 'mvtgeom') INTO tile FROM (
    SELECT id, name, subtype, class,
      ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
    FROM vector_map.vm_water
    WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
  ) q;
  result := result || COALESCE(tile, ''::bytea);

  IF z >= 8 THEN
    SELECT ST_AsMVT(q, 'land_use', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, subtype, class, surface,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_land_use
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  IF z >= 8 THEN
    SELECT ST_AsMVT(q, 'roads', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, class, subtype,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_roads
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  IF z >= 13 THEN
    SELECT ST_AsMVT(q, 'buildings', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, subtype, class, floors, height,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_buildings
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  IF z >= 14 THEN
    SELECT ST_AsMVT(q, 'places', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, category, website, phone,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_places
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  IF z >= 17 THEN
    SELECT ST_AsMVT(q, 'addresses', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, housenumber, street,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_addresses
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  SELECT ST_AsMVT(q, 'stores', 4096, 'mvtgeom') INTO tile FROM (
    SELECT sl.store_id, s.name, s.address, s.phone, s.working_hours, sl.marker_color,
      ST_AsMVTGeom(sl.geom, bounds, 4096, 64, true) AS mvtgeom
    FROM vector_map.store_locations sl
    JOIN public.stores s ON s.id = sl.store_id
    WHERE sl.geom && bounds AND ST_AsMVTGeom(sl.geom, bounds, 4096, 64, true) IS NOT NULL
  ) q;
  result := result || COALESCE(tile, ''::bytea);

  RETURN result;
END; $$;
