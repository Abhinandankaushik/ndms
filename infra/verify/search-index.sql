-- Throwaway rows, rolled back at the end: at a few hundred rows the planner rightly
-- prefers a sequential scan, so index use is only observable at realistic volume.
-- Expect a Bitmap Index Scan on the trigram indexes and an index scan for the id prefix;
-- a Seq Scan here means migration 20260921090000 did not take.
\set ON_ERROR_STOP on

BEGIN;

SELECT setseed(0.42);

WITH district AS (
  INSERT INTO districts (name, state, boundary)
  VALUES ('Search index check', 'Synthetic', ST_Multi(ST_MakeEnvelope(80, 20, 81, 21, 4326))::geography)
  RETURNING id
), reporter AS (
  INSERT INTO users (phone) VALUES ('+910000000001') RETURNING id
)
INSERT INTO incidents (client_uuid, district_id, reporter_id, location, location_source, reported_at,
                       address_text, description)
SELECT gen_random_uuid(), district.id, reporter.id,
       ST_SetSRID(ST_MakePoint(80 + random(), 20 + random()), 4326)::geography,
       'GPS', now(),
       -- One village in ~500 carries the rare name, so the search term is as selective as a
       -- real one. A term matching a fifth of the table is better served by a seq scan, and
       -- testing with one would prove nothing about the index.
       'Near ' || CASE WHEN n % 500 = 0 THEN 'Singhwara'
                       ELSE (ARRAY['Panchobh', 'Bariaul', 'Supaul', 'Badhiyapur'])[1 + (n % 4)] END,
       (ARRAY['Water rising fast', 'Building partly collapsed', 'Road washed out', 'Power line down'])[1 + (n % 4)]
FROM district, reporter, generate_series(1, 50000) AS n;

ANALYZE incidents;

\echo '--- Free-text search on address_text and description (selective term)'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id FROM incidents
WHERE address_text ILIKE '%Singhwara%' OR description ILIKE '%Singhwara%';

\echo '--- Id prefix, as a team would radio it in'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id FROM incidents WHERE id::text LIKE '0a1b2c3d%';

\echo '--- Reported-at window, served by incidents_district_status_reported_idx'
EXPLAIN (ANALYZE, COSTS OFF)
SELECT id FROM incidents
WHERE district_id = (SELECT id FROM districts WHERE name = 'Search index check')
  AND status = 'REPORTED'
  AND reported_at >= now() - interval '1 hour'
ORDER BY reported_at DESC
LIMIT 50;

ROLLBACK;
