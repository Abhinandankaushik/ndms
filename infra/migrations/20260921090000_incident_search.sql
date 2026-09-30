-- migrate:up

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Officers search free text over the two fields a report carries in words. Trigram GIN
-- keeps ILIKE '%term%' and similarity() index-served; a plain b-tree cannot serve either.
CREATE INDEX incidents_address_text_trgm_idx ON incidents USING GIN (address_text gin_trgm_ops);
CREATE INDEX incidents_description_trgm_idx ON incidents USING GIN (description gin_trgm_ops);

-- A team radios in the first characters of an id, so the prefix branch is LIKE 'abc%' on
-- the text form. text_pattern_ops is what makes that anchored match an index range scan.
CREATE INDEX incidents_id_text_prefix_idx ON incidents ((id::text) text_pattern_ops);

-- migrate:down

DROP INDEX IF EXISTS incidents_id_text_prefix_idx;
DROP INDEX IF EXISTS incidents_description_trgm_idx;
DROP INDEX IF EXISTS incidents_address_text_trgm_idx;
