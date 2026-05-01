-- Make lat/lng optional on stores (coordinates come from vector map geotags)
ALTER TABLE public.stores
  ALTER COLUMN latitude  DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL;

-- Addresses table (Overture Maps addresses theme → housenumbers)
CREATE TABLE IF NOT EXISTS vector_map.vm_addresses (
  id          TEXT PRIMARY KEY,
  geom        GEOMETRY(Point, 4326) NOT NULL,
  housenumber TEXT,
  street      TEXT
);
CREATE INDEX IF NOT EXISTS vm_addresses_geom_idx ON vector_map.vm_addresses USING GIST(geom);

-- Import function for addresses
CREATE OR REPLACE FUNCTION public.import_vm_addresses(features JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE cnt INTEGER := 0; feat JSONB;
BEGIN
  FOR feat IN SELECT jsonb_array_elements(features) LOOP
    INSERT INTO vector_map.vm_addresses(id, geom, housenumber, street)
    VALUES (
      feat->>'id',
      ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(feat->'geometry'), 4326)),
      feat->>'housenumber',
      feat->>'street'
    )
    ON CONFLICT (id) DO UPDATE SET
      geom        = EXCLUDED.geom,
      housenumber = EXCLUDED.housenumber,
      street      = EXCLUDED.street;
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END; $$;

-- Update MVT tile function to include addresses layer
CREATE OR REPLACE FUNCTION vector_map.get_tile(z INT, x INT, y INT)
RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  bounds GEOMETRY;
  result bytea := ''::bytea;
  tile   bytea;
BEGIN
  bounds := ST_TileEnvelope(z, x, y);

  -- Water (all zooms)
  SELECT ST_AsMVT(q, 'water', 4096, 'mvtgeom') INTO tile FROM (
    SELECT id, name, subtype, class,
      ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
    FROM vector_map.vm_water
    WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
  ) q;
  result := result || COALESCE(tile, ''::bytea);

  -- Land use (z >= 8)
  IF z >= 8 THEN
    SELECT ST_AsMVT(q, 'land_use', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, subtype, class, surface,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_land_use
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- Roads (z >= 8)
  IF z >= 8 THEN
    SELECT ST_AsMVT(q, 'roads', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, class, subtype,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_roads
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- Buildings (z >= 13)
  IF z >= 13 THEN
    SELECT ST_AsMVT(q, 'buildings', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, subtype, class, floors, height,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_buildings
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- Places (z >= 14)
  IF z >= 14 THEN
    SELECT ST_AsMVT(q, 'places', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, category, website, phone,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_places
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- Addresses / house numbers (z >= 17)
  IF z >= 17 THEN
    SELECT ST_AsMVT(q, 'addresses', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, housenumber, street,
        ST_AsMVTGeom(geom, bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_addresses
      WHERE geom && bounds AND ST_AsMVTGeom(geom, bounds, 4096, 64, true) IS NOT NULL
    ) q;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- Store locations (all zooms)
  SELECT ST_AsMVT(q, 'stores', 4096, 'mvtgeom') INTO tile FROM (
    SELECT sl.store_id, s.name, s.address, s.phone, s.working_hours,
      ST_AsMVTGeom(sl.geom, bounds, 4096, 64, true) AS mvtgeom
    FROM vector_map.store_locations sl
    JOIN public.stores s ON s.id = sl.store_id
    WHERE sl.geom && bounds AND ST_AsMVTGeom(sl.geom, bounds, 4096, 64, true) IS NOT NULL
  ) q;
  result := result || COALESCE(tile, ''::bytea);

  RETURN result;
END; $$;

-- Recreate public wrapper (drop first to allow return-type change if needed)
DROP FUNCTION IF EXISTS public.get_vector_tile(INT, INT, INT);
CREATE FUNCTION public.get_vector_tile(z INT, x INT, y INT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN encode(vector_map.get_tile(z, x, y), 'base64');
END; $$;

-- Update upsert_store_location to also sync stores.latitude/longitude
CREATE OR REPLACE FUNCTION public.upsert_store_location(
  p_store_id UUID,
  p_lng      DOUBLE PRECISION,
  p_lat      DOUBLE PRECISION
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO vector_map.store_locations(store_id, geom)
  VALUES (p_store_id, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  ON CONFLICT (store_id) DO UPDATE SET
    geom       = EXCLUDED.geom,
    updated_at = now();

  -- Keep stores.latitude/longitude in sync for raster map compatibility
  UPDATE public.stores
  SET latitude = p_lat, longitude = p_lng
  WHERE id = p_store_id;
END; $$;
