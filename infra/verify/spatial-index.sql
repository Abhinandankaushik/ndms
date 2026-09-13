-- Throwaway rows, rolled back at the end: at a few hundred rows the planner rightly
-- prefers a sequential scan, so index use is only observable at realistic volume.
\set ON_ERROR_STOP on

BEGIN;

SELECT postgis_version();

SELECT setseed(0.42);

WITH district AS (
  INSERT INTO districts (name, state, boundary)
  VALUES ('Index check', 'Synthetic', ST_Multi(ST_MakeEnvelope(80, 20, 81, 21, 4326))::geography)
  RETURNING id
), reporter AS (
  INSERT INTO users (phone) VALUES ('+910000000000') RETURNING id
)
INSERT INTO incidents (client_uuid, district_id, reporter_id, location, location_source, reported_at)
SELECT gen_random_uuid(), district.id, reporter.id,
       ST_SetSRID(ST_MakePoint(80 + random(), 20 + random()), 4326)::geography,
       'GPS', now()
FROM district, reporter, generate_series(1, 50000);

ANALYZE incidents;

\echo '--- ST_DWithin, 1 km radius'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id FROM incidents
WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(80.5, 20.5), 4326)::geography, 1000);

\echo '--- Viewport bounding box (rule 9)'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id FROM incidents
WHERE location && ST_MakeEnvelope(80.40, 20.40, 80.45, 20.45, 4326)::geography;

\echo '--- KNN, nearest 5'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id FROM incidents
ORDER BY location <-> ST_SetSRID(ST_MakePoint(80.5, 20.5), 4326)::geography
LIMIT 5;

ROLLBACK;
