#!/bin/sh
# Run inside the GDAL tools container: docker compose run --rm gdal sh tools/data/extract-district-boundary.sh
set -eu

SOURCE=data/raw/datameet/districts-2011/2011_Dist.shp
OUTPUT_DIR=data/seed/darbhanga
OUTPUT="$OUTPUT_DIR/district.geojson"

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT"

ogr2ogr -f GeoJSON "$OUTPUT" "$SOURCE" \
  -where "DISTRICT = 'Darbhanga' AND ST_NM = 'Bihar'" \
  -select DISTRICT,ST_NM,DT_CEN_CD,censuscode \
  -nln district \
  -nlt MULTIPOLYGON \
  -t_srs EPSG:4326 \
  -lco RFC7946=YES \
  -lco COORDINATE_PRECISION=6 \
  -lco WRITE_BBOX=YES

SUMMARY=$(ogrinfo -so "$OUTPUT" district)
FEATURES=$(printf '%s\n' "$SUMMARY" | sed -n 's/^Feature Count: //p')
if [ "$FEATURES" != "1" ]; then
  echo "Expected exactly 1 Darbhanga feature, found ${FEATURES:-0}" >&2
  exit 1
fi

printf '%s\n' "$SUMMARY" | sed -n 's/^Extent: /extent (lon,lat): /p'
ogrinfo -q -dialect SQLite \
  -sql "SELECT round(ST_Area(geometry, 1) / 1e6, 1) AS geodesic_area_km2, ST_IsValid(geometry) AS is_valid FROM district" \
  "$OUTPUT" | sed -n 's/^ *\(geodesic_area_km2\|is_valid\) ([A-Za-z]*) = /\1: /p'
