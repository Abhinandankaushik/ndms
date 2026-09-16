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
| Population | Census 2011: 3,937,385. WorldPop 2020 estimate inside the boundary: 4,402,776 (see below) |
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

### Villages, facilities, rivers — OpenStreetMap via Geofabrik

- **Source:** [`asia/india/eastern-zone-latest.osm.pbf`](https://download.geofabrik.de/asia/india/eastern-zone.html)
  (Bihar is in the eastern zone).
- **Snapshot:** `Last-Modified: Sat, 12 Sep 2026 23:39:58 GMT`, 247,018,037 bytes,
  MD5 `d5559d5097e42aff2b36b2d3c724bf35` (Geofabrik's published checksum).
- **Licence:** [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Anything
  extracted from it and redistributed, including GeoJSON committed to `data/seed/`,
  is a derived database under ODbL.
- **Attribution:** *© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)*.
  Required on every map view that shows this data, and in the report.
- **Extracted:** 2026-09-15 with `tools/data/extract-osm-features.sh`, clipped to the
  DataMeet polygon. Areas are reduced to a point inside them (`ST_PointOnSurface`).
  Running the script again on this snapshot reproduces the files byte for byte.

| File | Features | By tag |
|---|---|---|
| `osm-places.geojson` | 104 points | `place=` city 1, town 2, suburb 2, village 97, hamlet 2 |
| `osm-facilities.geojson` | 93 points | `amenity=` school 34, college 9, hospital 36, clinic 13, police 1, community_centre 0, fire_station 0 |
| `osm-waterways.geojson` | 120 lines, 589.7 km | `waterway=` river 72, stream 26, canal 22 |

Attributes kept: `osm_id` (`node/`, `way/` or `relation/` plus the id), `name`, the tag
above, and `isced_level` on facilities (the school level decides shelter capacity).

OSM coverage limits the seed in two ways. OSM maps only one police station inside the
district (Nehra Police Station, `way/1098745925`) and no fire station, even when the
extract is searched by name ("police", "thana", "fire", थाना, अग्निशमन, दमकल). Many
villages are also missing: OSM has 99 villages and hamlets here, far fewer than the
district really has.

#### ODbL notice for the committed OSM extracts

`data/seed/darbhanga/osm-places.geojson`, `osm-facilities.geojson` and
`osm-waterways.geojson` contain information from OpenStreetMap, which is made available
here under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
© OpenStreetMap contributors. They are derived databases: the Geofabrik snapshot above
filtered and clipped by `tools/data/extract-osm-features.sh`, which is the method of
making them that ODbL §4.6 requires us to offer. Anything built from them keeps the same
obligations if it is used publicly. That includes the seeded `villages`, `facilities` and
`rescue_teams` rows and maps that show them. Such uses must credit
"© OpenStreetMap contributors" and keep the data under ODbL.

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
- **What we have:** the national file stopped downloading at 453,751,934 bytes (432.7 of
  506.5 MiB). The server ignores HTTP Range requests, so the download cannot resume and
  GDAL `/vsicurl/` cannot read just the Darbhanga window. The saved
  `data/raw/worldpop/ind_ppp_2020_constrained.tif.part` is a striped GeoTIFF with one
  row per strip, and its header and the strips covering Darbhanga are complete. A strip
  missing from the file makes GDAL fail with a read error, so a clean clip proves the
  district's cells were all present.
- **Clip:** made on 2026-09-15 from the `.part` file with
  `gdalwarp -cutline data/seed/darbhanga/district.geojson -crop_to_cutline -dstnodata -99999`,
  written to `data/raw/worldpop/darbhanga_ppp_2020.tif` (gitignored).
  `tools/data/clip-worldpop.sh` repeats it: it uses the full `.tif` when present, otherwise
  the `.part`. A re-run on 2026-09-15 reproduced the file byte for byte.

| Clipped raster | Value |
|---|---|
| Size | 879 × 697 cells of 3 arc-seconds (83.3 × 92.3 m at the district's centre) |
| Cells with a population value | 29.37 % |
| Mean | 24.47 people per populated cell |
| Total | 4,402,776 people (+11.8 % on Census 2011's 3,937,385; WorldPop models 2020) |
| SHA-256 | `4228453ed4727bd815fde296261c79d1a4a7361bccd4f460e51c691c3dc0ea77` |

## Synthetic values

Everything below is generated by `tools/seed.ts` (modules in `tools/seed/`). It is
synthetic unless the table says otherwise, and it is deterministic.

### What is real and what is not

| Seeded data | Real | Synthetic |
|---|---|---|
| District | DataMeet boundary; population = WorldPop sum inside it | — |
| Villages | OSM place points and names | population is an estimate (1 km WorldPop sum) |
| Shelters, hospitals | OSM points, names and tags | kind rule for teaching hospitals, capacity, beds, occupancy, inventory |
| Rescue teams | base coordinates are OSM points | the teams themselves: agency choice, names, sizes, capabilities, availability |
| Users | — | every account, name and phone number |
| Incidents, status log, reviews, missions | placed near real OSM places, inside the real boundary | everything else: counts, times, types, text, people, outcomes, dispatches |

No coordinate is invented. Every village, facility and team base is an OSM point, and
every incident is an OSM place point moved by a random offset of at most 500 m.

### Random numbers and ids

- **Generator:** mulberry32 with the fixed seed **20260913**. Each part of the dataset
  (`facilities`, `inventory`, `reporters`, `incidents`) draws from its own mulberry32
  stream. A stream's seed is the first four bytes (unsigned 32-bit, little-endian) of
  SHA-256 of `20260913:<name>`, so a change in one part does not reshuffle the others.
- **Ids:** version-8 UUIDs from SHA-256 of `ndms-seed:20260913:<what the row is>`, for
  example `incident:0` or `facility:node/6956785821`. The same row keeps its id on every
  re-seed. Serial ids (district 1, villages 1–102) restart on `--reset`.
- **Time:** every timestamp is an offset from the moment the seed runs. Two runs hold the
  same data shifted in time. `tools/seed.ts` and `tools/verify-seed.ts` print a
  fingerprint: an MD5 over each incident's type, coordinates (7 decimals) and
  milliseconds before the newest report. With `--incidents 1000` it is
  `5b34805a5d2448731275c542e90a5121`, and it was identical on consecutive runs on
  2026-09-15.

### Villages

- **Merging:** 104 OSM places become 102 villages. Two points with the same name
  (case and punctuation ignored) within 250 m are one place mapped twice, and the first in
  file order is kept. This merged Bhagwanpur (`node/9071424076`, 1.7 m from
  `node/9071422478`) and Kharua (`node/9071424077`, 105.9 m from `node/9071422479`).
- **Unnamed places:** the three unnamed OSM places are named
  `Unnamed hamlet (OSM node/…)` or `Unnamed village (OSM node/…)`.
- **Population (estimate, plan §B2):** the sum of the WorldPop cells whose centres lie
  within 1 km of the point. Buffers overlap, so village populations do not add up to the
  district. Values range from 30 to 43,634 (Darbhanga city); the mean is 9,297. Without the
  raster, populations are NULL and the seed says so.

### Shelters and hospitals

- **Which facilities:** OSM features with the same amenity and name within 50 m are merged,
  which removes one double-mapped Sanskrit college (`node/13247080539`). The police
  station is not a facility. This leaves 40 shelters and 51 hospitals.
- **Kinds:** `school`, `college` and `community_centre` are shelters; `hospital` and
  `clinic` are hospitals. A college whose name contains "Hospital" is a teaching hospital,
  and a working hospital cannot take in evacuees, so it is a hospital with hospital beds.
  This applies to Darbhanga Medical College and Hospital (`way/688917294`) and Mithila
  Minority Dental College And Hospital (`way/1413191100`).
- **Shelter capacity (plan §B5):**

  | Rule | Capacity | Seeded |
  |---|---|---|
  | Primary school | 150 | 9 |
  | Secondary school | 400 | 7 |
  | College | 400 | 6 |
  | Community centre | 200 | 0 (none in OSM) |
  | School of unknown level | 150 | 18 |

  The school level comes from `isced:level`: a highest level of 3 or more is secondary,
  otherwise primary. India's classes 9–12 are ISCED 3. Without the tag, the name decides:
  "High", "Secondary", "Senior", "Intermediate", "Inter College", "Madhyamik", "Uchch",
  "+2", माध्यमिक or उच्च mean secondary; "Primary", "Prathmik", "Middle", "Madhya",
  "Nursery", "Kindergarten", प्राथमिक or मध्य mean primary. Anything else counts as
  unknown and is sized like a primary school, the smaller and far more common kind.
  The plan's 800-person purpose-built shelter does not apply: OSM `amenity=shelter` is not
  extracted, because in OSM it tags bus stops and huts, not flood shelters.
- **Hospital beds:** 60 per hospital (36 plus the two teaching hospitals), 10 per clinic (13).
- **Occupancy:** 40 % of shelters are hosting evacuees. Of those, 15 % are full and the
  rest are 15–97 % full. Hospitals are 35–90 % full. Each facility's `attributes` JSON
  records `source`, `osmId`, `osmAmenity`, `capacityRule`, `capacitySource: "synthetic"`,
  `schoolLevel` for schools and `beds` for hospitals.
- **Inventory:** every facility stocks all four items. The need is a per-place quantity
  times capacity: `FOOD_PACKET` 2, `WATER_LITRE` 3, `MEDICAL_KIT` 0.05, `BLANKET` 1.
  Quantity = need × U(0.25, 1.5), rounded; low-stock threshold = half the need
  (at least 1).
- **Demo states:** the first demo manager's shelter starts 80 % full, so admitting a few
  people crosses the 85 % capacity alert. The second demo manager's shelter holds food
  packets at 60 % of its low-stock threshold.

### Rescue teams

10 teams, each based on a real OSM point:

| Agency | Base (OSM) | How the base was chosen |
|---|---|---|
| POLICE | Nehra Police Station, `way/1098745925` | OSM police station (at most 2 used; OSM has 1) |
| FIRE | Darbhanga, `node/760197793` | OSM has no fire station in the district, so the largest settlement (the district headquarters) |
| NDRF | Laheriasarai, `node/11499503714` | next largest settlement |
| SDRF | Supaul `node/245740401`, Jalwara `node/9067323216`, Tarsarai `node/9071422481` | next three largest settlements |
| HEALTH | Government hospitals: Basant `node/7919575813`, Kurson Nadiyami `node/7919208390`, SubDivisional Hospital Benipur `node/6967961772`, Dethua `node/7918788803` | fill the roster to 10; each is the OSM hospital with "Government", "Govt", "Referral" or "Sub-divisional" in its name that lies farthest from the bases already chosen |

- **Largest settlement:** the city, towns and suburbs rank before villages, then by
  estimated population.
- **Sizes and capabilities:** NDRF 35 (`WATER_RESCUE`, `BOAT`,
  `COLLAPSED_STRUCTURE_SEARCH`, `FIRST_AID`), SDRF 20 (`WATER_RESCUE`, `BOAT`,
  `FIRST_AID`), FIRE 8 (`FIREFIGHTING`, `RESCUE_TOOLS`, `FIRST_AID`), POLICE 10
  (`EVACUATION`, `CROWD_CONTROL`, `FIRST_AID`), HEALTH 5 (`MEDICAL`, `AMBULANCE`,
  `FIRST_AID`).
- **Names and position:** a team is named "<agency label>, <base name>". Its current
  location is its base, because no live position has been reported yet.

### Users

- **Demo accounts:** 15, listed [below](#demo-accounts).
- **Team leads:** 10 accounts, one per team: `+919200000001`–`+919200000010`, named
  "Team Lead, <team>". A team's mission steps are attributed to its demo rescuer where it
  has one, otherwise to its lead, just as the API records the acting user.
- **Reporters:** max(25, ⌈0.6 × incidents⌉) citizen accounts from `+919100000001` upward
  (600 for 1,000 incidents), with no district, like OTP sign-ups. Their names combine
  common local given names and surnames from two pools, drawn 77:23.
- **Phones:** every phone number is synthetic and nothing is ever sent to one. Login uses
  the fixed development OTP.

### Incidents

- **Where:**
  - Pick a village by weighted sampling (plan §B11): weight = estimated population ×
    exp(−d / 2000 m), where d is the distance to the nearest OSM river, stream or canal.
  - Move the point uniformly within 500 m of the village. An offset that lands outside the
    district is redrawn, up to 25 times, then the village point itself is used.
  - Without the raster, every village weighs 1 × exp(−d / 2000 m): the documented fallback.
- **When:** reported_at = now − 48 h × (1 − √U), but at least 2 minutes ago, so reports
  become denser towards the present, like a flood that is still getting worse. created_at =
  reported_at + 2–25 s, which satisfies `incidents_reported_at_clamped`.
- **What:**
  - 30 % are SOS. An SOS carries no text or flags and 1–6 people. 40 % of SOS name no
    type and are stored as OTHER, as the API does.
  - Other reports take a type by weight: FLOOD 0.58, FIRE 0.12, OTHER 0.12,
    BUILDING_COLLAPSE 0.10, EARTHQUAKE 0.04, CYCLONE 0.04. There is no LANDSLIDE:
    Darbhanga is flat alluvial plain.
  - People affected is log-uniform from 1 to a per-type maximum: FLOOD 80,
    EARTHQUAKE/CYCLONE 40, BUILDING_COLLAPSE 30, FIRE 25, OTHER 8.
  - Flags: elderly 25 %, children 35 %, injured 35 % for FIRE, BUILDING_COLLAPSE and
    EARTHQUAKE, otherwise 12 %.
  - Descriptions are stock sentences from `tools/seed/narratives.ts`; none describes a real
    event.
- **Location source:** 1 % of SOS have no fix (`NONE`, no location); the rest use GPS
  with 5–60 m accuracy. 25 % of other reports use a manual pin, the rest GPS with 4–30 m.
- **Echoes:** 4 % of reports repeat an earlier located report: same type, within 120 m,
  2–14 minutes later. Echoes at least 45 minutes old were rejected as duplicates by an
  official, with a resolved review. Younger ones wait as pending `POSSIBLE_DUPLICATE`
  reviews.
- **The duplicate cluster (CLAUDE.md §9):**
  - 8 FIRE reports, 3 of them SOS, from 8 different reporters.
  - Placed within 70 m of a point that is itself within 300 m of Darbhanga city, so they
    are at most 140 m apart. They were reported over 11.5 minutes, ending 30 minutes
    before the seed ran.
  - They reached the server in the order they were made, and 7 pending
    `POSSIBLE_DUPLICATE` reviews point at the first report.
  - As seeded they are at most 106.4 m and 11 min 30 s apart (PostGIS distance, checked
    by `tools/verify-seed.ts`).
- **Outcomes by age:**

  | Report age | REPORTED | VERIFIED | RESOLVED | REJECTED_FAKE |
  |---|---|---|---|---|
  | under 1 h | 80 % | 17 % | — | 3 % |
  | 1–12 h | 45 % | 35 % | 14 % | 6 % |
  | over 12 h | 25 % | 35 % | 33 % | 7 % |

  - A report without a location stays REPORTED, with a pending `LOCATION_UNCERTAIN`
    review.
  - A report that has echoes is verified rather than rejected as fake.
  - Two open, non-SOS reports 1–6 hours old carry a pending `POSSIBLE_FAKE` flag raised by
    an official.
  - Nothing is ever rejected without an official as the actor (rule 8).
- **Missions:**
  - Five open missions, one per slot: NDRF ASSIGNED, SDRF EN_ROUTE, SDRF ON_SITE, HEALTH
    ACCEPTED, POLICE ASSIGNED.
  - Each goes to the report nearest the team's base that is open, located, 45 min to 8 h
    old, and of a type the agency handles:

    | Agency | Handles |
    |---|---|
    | NDRF | FLOOD, BUILDING_COLLAPSE, EARTHQUAKE, CYCLONE |
    | SDRF | FLOOD, CYCLONE, BUILDING_COLLAPSE |
    | FIRE | FIRE |
    | POLICE | FLOOD, OTHER |
    | HEALTH | OTHER, BUILDING_COLLAPSE, EARTHQUAKE |

  - The 12 most recently resolved reports at least 90 minutes old get a COMPLETED mission
    from the nearest suitable team.
  - Minutes between steps: verify 3–20, assign 5–25, accept 2–8, set off 1–5, arrive
    10–45, finish 20–90. They are compressed proportionally when a report is too recent.
  - ETA is 10–60 min. A completed mission rescued everyone reported.
  - Incident and team states follow the contract's mission side effects:
    - ASSIGNED and ACCEPTED missions leave the incident ASSIGNED.
    - EN_ROUTE and ON_SITE make it IN_PROGRESS.
    - COMPLETED resolves it.
    - A team that has accepted a mission is unavailable.
- **Status log:** every incident starts with the reporter's NULL → REPORTED row. Each later
  change is logged with its actor and the note the API writes, for example
  "Team … assigned" or "Team … is en route".
- **Left for the worker:** `priority_score` and `severity_level` are NULL. The worker's
  sweep, which first runs a minute after the worker starts, scores every open incident.
  Using the same 150 m / 15 minute rule, it agrees with every seeded duplicate flag and
  adds a couple more where unrelated reports happen to fall that close.

With `--incidents 1000` the seeded incidents are:

| | |
|---|---|
| Status | 67.6 % open: REPORTED 342, VERIFIED 329, ASSIGNED 3, IN_PROGRESS 2, RESOLVED 238, REJECTED_FAKE 53, REJECTED_DUPLICATE 33 |
| Type | FLOOD 518, OTHER 215, FIRE 108, BUILDING_COLLAPSE 101, EARTHQUAKE 33, CYCLONE 25 |
| Reports | 298 SOS (3 without a location), 959 first reports, 33 echoes, 8 in the cluster |
| Missions | 17: ASSIGNED 2, ACCEPTED 1, EN_ROUTE 1, ON_SITE 1, COMPLETED 12 |
| Reviews | 45: 12 pending (7 POSSIBLE_DUPLICATE, 3 LOCATION_UNCERTAIN, 2 POSSIBLE_FAKE), 33 resolved |

## Demo accounts

Log in with the phone number and the development OTP **123456** (`OTP_DEV_CODE`).
The seed prints this list at the end of every run.

| Phone | Role | Assigned to |
|---|---|---|
| +919000000001 | CITIZEN | No district, like a self-registered citizen. With 1,000 incidents: 3 earlier reports |
| +919000000002 | CITIZEN | No district. 2 earlier reports |
| +919000000003 | CITIZEN | No district. 2 earlier reports |
| +919000000004 | VOLUNTEER | Darbhanga district; verified volunteer at Darbhanga (`node/760197793`), 15 km radius, skills `SWIMMER`, `FIRST_AID` |
| +919000000005 | VOLUNTEER | Darbhanga district; verified volunteer at Laheriasarai (`node/11499503714`), 15 km radius, skill `BOATMAN` |
| +919000000006 | VOLUNTEER | Darbhanga district; verified volunteer at Supaul (`node/245740401`), 15 km radius, skills `DRIVER`, `FIRST_AID` |
| +919000000007 | RESCUE_TEAM | NDRF Team, Laheriasarai. Holds an ASSIGNED mission waiting to be accepted |
| +919000000008 | RESCUE_TEAM | SDRF Team, Supaul. Holds a mission EN_ROUTE |
| +919000000009 | RESCUE_TEAM | Fire and Emergency Services, Darbhanga. Free, and the fire team nearest the duplicate cluster |
| +919000000010 | FACILITY_MANAGER | Shelter Holy Cross School (`way/1416887801`): 400 places, 320 occupied, so 20 admissions reach the 85 % alert |
| +919000000011 | FACILITY_MANAGER | Shelter D.A.V. Public School (`node/8309239666`): 150 places, food packets low (90, threshold 150) |
| +919000000012 | FACILITY_MANAGER | Hospital Shyama Surgical Sansthan (`node/6956785821`): 60 synthetic beds |
| +919000000013 | GOVT_OFFICIAL | Darbhanga district |
| +919000000014 | GOVT_OFFICIAL | Darbhanga district |
| +919000000015 | GOVT_OFFICIAL | Darbhanga district |

Team leads (`+919200000001`–`+919200000010`) and reporters (`+919100000001` upward) can log
in the same way.

## Reproducing

Download the files listed above to these paths and check them against the checksums:

| Dataset | Local path |
|---|---|
| DataMeet districts | `data/raw/datameet/districts-2011/2011_Dist.{shp,shx,dbf,prj}` |
| Geofabrik extract | `data/raw/osm/eastern-zone-latest.osm.pbf` |
| WorldPop raster | `data/raw/worldpop/ind_ppp_2020_constrained.tif` (or the `.part` described above) |

Then run the extraction steps in the GDAL tools container:

```bash
docker compose run --rm gdal sh tools/data/extract-district-boundary.sh   # or: pnpm data:boundary
docker compose run --rm gdal sh tools/data/compare-osm-boundary.sh
docker compose run --rm gdal sh tools/data/extract-osm-features.sh        # data/seed/darbhanga/osm-*.geojson
docker compose run --rm gdal sh tools/data/clip-worldpop.sh               # data/raw/worldpop/darbhanga_ppp_2020.tif
```

Seed and check the database with Node 24, from the repo root. The seed reads
`DATABASE_URL` from `.env`.

```bash
docker compose up -d --wait postgres redis
docker compose run --rm migrate
node tools/seed.ts --reset --incidents 1000   # --reset truncates every table except schema_migrations and spatial_ref_sys
node tools/verify-seed.ts                     # PostGIS checks of the seeded data, and the fingerprint
node --test "tools/seed/**/*.test.ts"         # unit tests of the generator
```

Without `--reset`, the seed refuses to write into a database that already holds data.
