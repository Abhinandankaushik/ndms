#!/bin/sh
# Clips WorldPop 2020 (constrained, 100 m) to the canonical DataMeet district boundary and
# prints the statistics recorded in data/SOURCES.md.
# Run inside the GDAL tools container: docker compose run --rm gdal sh tools/data/clip-worldpop.sh [output.tif]
set -eu

DISTRICT=data/seed/darbhanga/district.geojson
FULL=data/raw/worldpop/ind_ppp_2020_constrained.tif
PARTIAL="$FULL.part"
OUTPUT=${1:-data/raw/worldpop/darbhanga_ppp_2020.tif}

# The national download stopped at 432.7 of 506.5 MB and the server cannot resume it. The
# file is a striped GeoTIFF (one row per strip) whose header and Darbhanga strips are
# complete, so the partial file clips correctly. A strip it lacks raises a read ERROR.
if [ -f "$FULL" ]; then
  SOURCE=$FULL
elif [ -f "$PARTIAL" ]; then
  SOURCE=$PARTIAL
else
  echo "Neither $FULL nor $PARTIAL exists" >&2
  exit 1
fi
echo "source: $SOURCE"

ERRORS=$(mktemp)
if ! gdalwarp -q -overwrite -cutline "$DISTRICT" -crop_to_cutline -dstnodata -99999 "$SOURCE" "$OUTPUT" 2>"$ERRORS" \
  || grep -q ERROR "$ERRORS"; then
  cat "$ERRORS" >&2
  echo "Clipping failed" >&2
  exit 1
fi

python3 - "$OUTPUT" <<'PY'
import sys

import numpy as np
from osgeo import gdal

gdal.UseExceptions()
dataset = gdal.Open(sys.argv[1])
band = dataset.GetRasterBand(1)
values = band.ReadAsArray()
valid = values[values != band.GetNoDataValue()]
print(f"size: {dataset.RasterXSize}x{dataset.RasterYSize} cells")
print(f"valid: {100 * valid.size / values.size:.2f} %")
print(f"mean: {valid.mean(dtype=np.float64):.2f} people per valid cell")
print(f"total: {valid.sum(dtype=np.float64):,.0f} people")
PY
sha256sum "$OUTPUT"
