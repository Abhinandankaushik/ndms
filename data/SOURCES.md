# Data sources

Every dataset NDMS loads, with its licence and the attribution it requires.
Locations are real. Any value we generate instead of measure is listed under
[Synthetic values](#synthetic-values) (CLAUDE.md §9).

Raw downloads live in `data/raw/` (gitignored). Small derived files that the seed
reads are committed under `data/seed/`.

## Demo district

| | |
|---|---|
| District | Darbhanga, Bihar |
| Census 2011 codes | `DT_CEN_CD` 13, `censuscode` 215 |
| Boundary file | `data/seed/darbhanga/district.geojson` (one valid polygon, WGS 84) |
| Extent (lon, lat) | 85.673142, 25.866815 → 86.407072, 26.447959 |
| Area | 2,286.3 km² geodesic, computed from the boundary. Census 2011 official: [2,279 km²](https://darbhanga.nic.in/demography/) (+0.3 %) |
| Chosen | 2026-09-13 |

**Why DataMeet rather than OSM for the boundary** (checked 2026-09-13 with
`tools/data/compare-osm-boundary.sh`):

| Polygon | Geodesic area | vs Census 2,279 km² |
|---|---|---|
| DataMeet Census 2011 | 2,286.3 km² | +0.3 % |
| OSM relation (`admin_level=5`, Geofabrik snapshot below) | 2,517.4 km² | +10.5 % |

The two polygons share 2,239.0 km². OSM has 278.5 km² that DataMeet does not, mostly
a southern extension down to latitude 25.72; DataMeet has 47.3 km² that OSM does not.
The DataMeet polygon is canonical, and OSM features are clipped to it.

## Datasets

### District boundaries — DataMeet India, Census 2011 districts

- **Source:** [`datameet/maps` `Districts/Census_2011/2011_Dist.*`](https://github.com/datameet/maps/tree/b3fbbde595310b397a55d718e0958ce249a4fa1f/Districts/Census_2011),
  pinned to commit `b3fbbde595310b397a55d718e0958ce249a4fa1f`. The files have been
  unchanged since 2014.
- **Retrieved:** 2026-09-13.
- **Licence:** [CC BY 2.5 India](https://creativecommons.org/licenses/by/2.5/in/). This
  licence is stated in `Districts/README.md` and overrides the repository-wide defaults:
  the repo's `LICENSE` file is MIT, and its README says CC BY 4.0. The implementation
  plan's "MIT" claim is wrong.
- **Attribution:** *District boundaries © DataMeet India community
  ([github.com/datameet/maps](https://github.com/datameet/maps)), CC BY 2.5 IN.*
- **Accuracy:** approximate. DataMeet derived the boundaries from taluk boundaries
  (GeoCommons, Bhuvan) and took names from the Census 2011 Administrative Atlas.
- **SHA-256:**
  - `2011_Dist.shp` `3636e627a519f67b4615b6a97df48c2b279e8c7b2566d3bfbc3eda1d06e33206`
  - `2011_Dist.shx` `12b6028dfac9e3f20686b3d0a44f9d3989acfdb3f3cda853881d1cf2d8579eab`
  - `2011_Dist.dbf` `2c7b03578fdf41a4c4e29941a564fa90bf0b0e4f865f5e54481ef7ac8494eb7d`
  - `2011_Dist.prj` `a02a27b1d1982c8516d83398e85a3c8b1aef1713c13ef4d84d7bde17430c07c4`

### Roads, villages, facilities, rivers — OpenStreetMap via Geofabrik

- **Source:** [`asia/india/eastern-zone-latest.osm.pbf`](https://download.geofabrik.de/asia/india/eastern-zone.html)
  (Bihar is in the eastern zone).
- **Snapshot:** `Last-Modified: Sat, 12 Sep 2026 23:39:58 GMT`, 247,018,037 bytes,
  MD5 `d5559d5097e42aff2b36b2d3c724bf35` (Geofabrik's published checksum).
- **Licence:** [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Anything
  extracted from it and redistributed, including GeoJSON committed to `data/seed/`,
  is a derived database under ODbL.
- **Attribution:** *© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)*.
  Required on every map view that shows this data, and in the report.
- **Status:** downloaded and checksum-verified. Only the district relation has been read
  so far, for the boundary comparison. Villages and facilities are not extracted yet.

### Population — WorldPop 2020, constrained, 100 m

- **Source:** [`ind_ppp_2020_constrained.tif`](https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/IND/ind_ppp_2020_constrained.tif)
  (WorldPop dataset id 49804). 531,062,384 bytes; `Last-Modified: Sun, 20 Sep 2020 00:32:07 GMT`.
- **Licence:** [CC BY 4.0](https://hub.worldpop.org/data/licence.txt).
- **Citation:** Bondarenko M., Kerr D., Sorichetta A., and Tatem, A.J. 2020.
  *Census/projection-disaggregated gridded population datasets for 189 countries in 2020
  using Built-Settlement Growth Model (BSGM) outputs.* WorldPop, University of
  Southampton, UK. doi:[10.5258/SOTON/WP00684](https://doi.org/10.5258/SOTON/WP00684)
- **Note:** this is the version that is *not* UN-adjusted. The UN-adjusted variant has a
  different DOI (WP00685); do not mix them up in the report.
- **Status:** downloading. The server ignores HTTP Range requests, so the download
  cannot resume and GDAL `/vsicurl/` cannot read just the Darbhanga window. It was
  measured at ~35 KB/s from this network on 2026-09-13, which means several hours.

## Synthetic values

None generated yet. Each synthetic value will be listed here when it is created, with
the script that generates it, the heuristic behind it and the RNG seed. Planned so far:

- shelter capacities by facility type (implementation plan §B5)
- incident placement weighted by population and distance to rivers, including the
  deliberate duplicate cluster of 8 reports within 150 m and 12 minutes

## Reproducing

Download the files listed above to these paths and check them against the checksums:

| Dataset | Local path |
|---|---|
| DataMeet districts | `data/raw/datameet/districts-2011/2011_Dist.{shp,shx,dbf,prj}` |
| Geofabrik extract | `data/raw/osm/eastern-zone-latest.osm.pbf` |
| WorldPop raster | `data/raw/worldpop/ind_ppp_2020_constrained.tif` |

Then run the extraction steps in the GDAL tools container:

```bash
docker compose run --rm gdal sh tools/data/extract-district-boundary.sh   # or: pnpm data:boundary
docker compose run --rm gdal sh tools/data/compare-osm-boundary.sh
```
