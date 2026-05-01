-- Fix get_tile: data is stored in SRID 4326 but ST_TileEnvelope returns SRID 3857.
-- Two fixes:
--   1. Use bounds4326 (ST_Transform to 4326) for the && spatial filter
--   2. Explicitly ST_Transform(geom, 3857) before ST_AsMVTGeom — it does not auto-reproject

CREATE OR REPLACE FUNCTION vector_map.get_tile(z INT, x INT, y INT)
RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  bounds     GEOMETRY;
  bounds4326 GEOMETRY;
  result     bytea := ''::bytea;
  tile       bytea;
BEGIN
  bounds     := ST_TileEnvelope(z, x, y);
  bounds4326 := ST_Transform(bounds, 4326);

  SELECT ST_AsMVT(q, 'water', 4096, 'mvtgeom') INTO tile FROM (
    SELECT id, name, subtype, class,
      ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
    FROM vector_map.vm_water
    WHERE geom && bounds4326
  ) q WHERE mvtgeom IS NOT NULL;
  result := result || COALESCE(tile, ''::bytea);

  IF z >= 8 THEN
    SELECT ST_AsMVT(q, 'land_use', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, subtype, class, surface,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_land_use
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  IF z >= 8 THEN
    SELECT ST_AsMVT(q, 'roads', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, class, subtype,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_roads
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  IF z >= 13 THEN
    SELECT ST_AsMVT(q, 'buildings', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, subtype, class, floors, height,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_buildings
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  IF z >= 14 THEN
    SELECT ST_AsMVT(q, 'places', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, category, website, phone,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_places
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  IF z >= 17 THEN
    SELECT ST_AsMVT(q, 'addresses', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, housenumber, street,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_addresses
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  SELECT ST_AsMVT(q, 'stores', 4096, 'mvtgeom') INTO tile FROM (
    SELECT sl.store_id, s.name, s.address, s.phone, s.working_hours, sl.marker_color,
      ST_AsMVTGeom(ST_Transform(sl.geom, 3857), bounds, 4096, 64, true) AS mvtgeom
    FROM vector_map.store_locations sl
    JOIN public.stores s ON s.id = sl.store_id
    WHERE sl.geom && bounds4326
  ) q WHERE mvtgeom IS NOT NULL;
  result := result || COALESCE(tile, ''::bytea);

  RETURN result;
END; $$;
