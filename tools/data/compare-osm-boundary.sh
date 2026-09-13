#!/bin/sh
# Cross-checks the DataMeet boundary against OSM's Darbhanga relation.
# Run inside the GDAL tools container: docker compose run --rm gdal sh tools/data/compare-osm-boundary.sh
set -eu

PBF=data/raw/osm/eastern-zone-latest.osm.pbf
DATAMEET=data/seed/darbhanga/district.geojson
WORK=data/raw/boundary-compare.gpkg

ogr2ogr -f GPKG -overwrite "$WORK" "$DATAMEET" -nln datameet
ogr2ogr -f GPKG -update -overwrite "$WORK" "$PBF" multipolygons \
  -spat 85.4 25.5 86.7 26.7 \
  -where "boundary = 'administrative' AND admin_level = '5' AND name = 'Darbhanga'" \
  -nln osm

ogrinfo -q -dialect SQLite -sql "SELECT count(*) AS osm_features FROM osm" "$WORK"
ogrinfo -q -dialect SQLite -sql "
  SELECT round(ST_Area(o.geom, 1) / 1e6, 1) AS osm_km2,
         round(ST_Area(d.geom, 1) / 1e6, 1) AS datameet_km2,
         round(ST_Area(ST_Intersection(o.geom, d.geom), 1) / 1e6, 1) AS overlap_km2,
         round(ST_Area(ST_Difference(o.geom, d.geom), 1) / 1e6, 1) AS osm_only_km2,
         round(ST_Area(ST_Difference(d.geom, o.geom), 1) / 1e6, 1) AS datameet_only_km2,
         round(ST_MinY(o.geom), 3) AS osm_min_lat,
         round(ST_MinY(d.geom), 3) AS datameet_min_lat
  FROM osm o, datameet d" "$WORK"
