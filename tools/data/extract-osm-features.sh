#!/bin/sh
# Extracts the OSM places, facilities and waterways the seed reads, clipped to the canonical
# DataMeet boundary. The outputs are derived databases under ODbL 1.0 (data/SOURCES.md).
# Run inside the GDAL tools container: docker compose run --rm gdal sh tools/data/extract-osm-features.sh
set -eu

PBF=data/raw/osm/eastern-zone-latest.osm.pbf
DISTRICT=data/seed/darbhanga/district.geojson
WORK="$(mktemp -d)/darbhanga-features.gpkg"
OUTPUT_DIR=data/seed/darbhanga

PLACES="city town suburb village hamlet"
FACILITIES="school college community_centre hospital clinic police fire_station"
WATERWAYS="river stream canal"

sql_list() {
  printf "'%s'," $1 | sed 's/,$//'
}

EXTENT=$(ogrinfo -so "$DISTRICT" district | sed -n 's/^Extent: (\([^,]*\), \([^)]*\)) - (\([^,]*\), \([^)]*\))$/\1 \2 \3 \4/p')
if [ -z "$EXTENT" ]; then
  echo "Could not read the extent of $DISTRICT" >&2
  exit 1
fi

# One pass over the PBF for all three layers: tools/data/osmconf-ndms.ini gives every layer
# the same keys, so one filter fits them all. GEOMETRY because clipping can split a line.
ogr2ogr -f GPKG -overwrite "$WORK" "$PBF" points lines multipolygons \
  --config OSM_CONFIG_FILE tools/data/osmconf-ndms.ini \
  -spat $EXTENT \
  -clipsrc "$DISTRICT" \
  -nlt GEOMETRY \
  -where "place IN ($(sql_list "$PLACES")) OR amenity IN ($(sql_list "$FACILITIES")) OR waterway IN ($(sql_list "$WATERWAYS"))"

write_geojson() {
  output="$OUTPUT_DIR/osm-$1.geojson"
  rm -f "$output"
  ogr2ogr -f GeoJSON "$output" "$WORK" -dialect SQLite -sql "$2" -nln "$1" \
    -lco RFC7946=YES -lco COORDINATE_PRECISION=6
}

# Areas are reduced with ST_PointOnSurface, which, unlike a centroid, always lies inside the
# (already clipped) area and therefore inside the district.
write_geojson places "
  SELECT 'node/' || osm_id AS osm_id, name, place, geom
  FROM points WHERE place IN ($(sql_list "$PLACES"))
  UNION ALL
  SELECT COALESCE('way/' || osm_way_id, 'relation/' || osm_id), name, place, ST_PointOnSurface(geom)
  FROM multipolygons WHERE place IN ($(sql_list "$PLACES"))
  ORDER BY osm_id"

# isced_level is kept because the shelter capacity heuristic depends on the school level.
write_geojson facilities "
  SELECT 'node/' || osm_id AS osm_id, name, amenity, isced_level, geom
  FROM points WHERE amenity IN ($(sql_list "$FACILITIES"))
  UNION ALL
  SELECT COALESCE('way/' || osm_way_id, 'relation/' || osm_id), name, amenity, isced_level, ST_PointOnSurface(geom)
  FROM multipolygons WHERE amenity IN ($(sql_list "$FACILITIES"))
  ORDER BY osm_id"

write_geojson waterways "
  SELECT 'way/' || osm_id AS osm_id, name, waterway, geom
  FROM lines
  WHERE waterway IN ($(sql_list "$WATERWAYS")) AND ST_GeometryType(geom) IN ('LINESTRING', 'MULTILINESTRING')
  ORDER BY osm_id"

count_features() {
  ogrinfo -q -dialect SQLite -sql "SELECT count(*) AS features FROM $1 $2" "$OUTPUT_DIR/osm-$1.geojson" \
    | sed -n 's/^ *features ([A-Za-z]*) = //p'
}

# Every requested value is listed, including those OSM has none of, because a zero (no fire
# station in the district) changes what the seed can do.
print_counts() {
  echo "$1: $(count_features "$1" "")"
  for value in $3; do
    printf '  %-17s %s\n' "$value" "$(count_features "$1" "WHERE $2 = '$value'")"
  done
}

print_counts places place "$PLACES"
print_counts facilities amenity "$FACILITIES"
print_counts waterways waterway "$WATERWAYS"
ogrinfo -q -dialect SQLite \
  -sql "SELECT round(sum(ST_Length(geometry, 1)) / 1000, 1) AS waterway_km FROM waterways" \
  "$OUTPUT_DIR/osm-waterways.geojson" | sed -n 's/^ *waterway_km ([A-Za-z]*) = \(.*\)$/waterway length: \1 km/p'
