-- Optimize vector tile generation:
--   1. Roads: filter by class at low zoom (only major roads at z<10, add primary at z<12, etc.)
--   2. Water + land_use: ST_SimplifyPreserveTopology at low zoom to reduce polygon vertex count
--   3. land_use: raise to z>=10 (large polygons at z=8 cover too many features uselessly)

CREATE OR REPLACE FUNCTION vector_map.get_tile(z INT, x INT, y INT)
RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  bounds     GEOMETRY;
  bounds4326 GEOMETRY;
  result     bytea := ''::bytea;
  tile       bytea;
  simplify   FLOAT8;
BEGIN
  bounds     := ST_TileEnvelope(z, x, y);
  bounds4326 := ST_Transform(bounds, 4326);

  -- Simplification tolerance in degrees (SRID 4326).
  -- ~0.0005° ≈ 55 m at z≤8; tapers to 0 at z≥13 (no simplification needed).
  simplify := CASE
    WHEN z <= 8  THEN 0.0005
    WHEN z <= 10 THEN 0.0001
    WHEN z <= 12 THEN 0.00002
    ELSE 0
  END;

  -- ── Water: always, simplified at low zoom ────────────────────────────────
  SELECT ST_AsMVT(q, 'water', 4096, 'mvtgeom') INTO tile FROM (
    SELECT id, name, subtype, class,
      ST_AsMVTGeom(
        ST_Transform(
          CASE WHEN simplify > 0
               THEN ST_SimplifyPreserveTopology(geom, simplify)
               ELSE geom END,
          3857),
        bounds, 4096, 64, true) AS mvtgeom
    FROM vector_map.vm_water
    WHERE geom && bounds4326
  ) q WHERE mvtgeom IS NOT NULL;
  result := result || COALESCE(tile, ''::bytea);

  -- ── Land use: z≥10, simplified at z=10–12 ───────────────────────────────
  IF z >= 10 THEN
    SELECT ST_AsMVT(q, 'land_use', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, subtype, class, surface,
        ST_AsMVTGeom(
          ST_Transform(
            CASE WHEN simplify > 0
                 THEN ST_SimplifyPreserveTopology(geom, simplify)
                 ELSE geom END,
            3857),
          bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_land_use
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- ── Roads: z≥8, class-filtered at low zoom ───────────────────────────────
  -- z<10 : only motorway/trunk   (intercity highways visible from afar)
  -- z<12 : add primary           (main city arteries)
  -- z<13 : add secondary         (district roads)
  -- z≥13 : all roads
  IF z >= 8 THEN
    SELECT ST_AsMVT(q, 'roads', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, class, subtype,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_roads
      WHERE geom && bounds4326
        AND CASE
          WHEN z < 10 THEN class IN ('motorway', 'trunk')
          WHEN z < 12 THEN class IN ('motorway', 'trunk', 'primary')
          WHEN z < 13 THEN class IN ('motorway', 'trunk', 'primary', 'secondary')
          ELSE true
        END
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- ── Buildings: z≥13 ──────────────────────────────────────────────────────
  IF z >= 13 THEN
    SELECT ST_AsMVT(q, 'buildings', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, subtype, class, floors, height,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_buildings
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- ── Places: z≥14 ─────────────────────────────────────────────────────────
  IF z >= 14 THEN
    SELECT ST_AsMVT(q, 'places', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, name, category, website, phone,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_places
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- ── Addresses: z≥17 ──────────────────────────────────────────────────────
  IF z >= 17 THEN
    SELECT ST_AsMVT(q, 'addresses', 4096, 'mvtgeom') INTO tile FROM (
      SELECT id, housenumber, street,
        ST_AsMVTGeom(ST_Transform(geom, 3857), bounds, 4096, 64, true) AS mvtgeom
      FROM vector_map.vm_addresses
      WHERE geom && bounds4326
    ) q WHERE mvtgeom IS NOT NULL;
    result := result || COALESCE(tile, ''::bytea);
  END IF;

  -- ── Store locations: always ───────────────────────────────────────────────
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
