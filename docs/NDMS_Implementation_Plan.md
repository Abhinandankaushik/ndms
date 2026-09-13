# National Disaster Management System (NDMS)
### Complete Implementation Plan — Minor + Major Project

---

## 0. Document Purpose

This is a build plan, not a proposal. It tells you *what to write, in what order, and by which week*. Every section maps to actual files, tables, endpoints, or algorithms.

**Read the "Scope Discipline" section before anything else.** The biggest failure mode for this project is not technical difficulty — it is building 30% of fifteen features instead of 100% of seven.

### How this document is organised

| Part | Contents | When you use it |
|---|---|---|
| **Main plan** (§1–19) | Problem statement, scope, stack, architecture, database schema, APIs, AI modules, digital twin, timeline, testing, demo script, risks | Read once end to end before you start. Revisit §5 (schema) and §12 (timeline) constantly |
| **Part A** | Complete feature catalogue — every feature, Minor vs Major, with effort estimates and implementation detail | Your week-to-week working reference. Tick features off as you build |
| **Part B** | Data acquisition handbook — exact sources, download commands, licences, seed script | Weeks 1–3. Do not defer this |

### Quick navigation

- **"What am I building this week?"** → §12 Timeline, then the matching table in Part A
- **"How does this feature actually work?"** → Part A, the relevant module section
- **"Where do I get this data?"** → Part B
- **"What does the examiner ask?"** → §15 Demo Script and §16 Risk Register
- **"What goes in the report?"** → §17 Report Structure

### The three rules

1. **Build the spine before the intelligence.** A working minor with no AI beats a half-built major with three notebooks.
2. **Real geography, declared synthetic attributes.** Never invent coordinates. Always state which numbers are generated.
3. **Cut early, cut publicly.** Every deferred feature goes in the report as documented future work, not as a silent gap.

---

## 1. Problem Statement (formal version for your report)

During a disaster event in India, response is coordinated across NDRF, SDRF, state administration, district collectors, hospitals, police, NGOs, and volunteers. These actors currently operate on **disjoint information systems** — phone calls, WhatsApp groups, department-specific portals, and paper registers.

This produces five measurable failures:

| # | Failure | Consequence |
|---|---------|-------------|
| F1 | Information fragmentation | No single authority knows the true incident count |
| F2 | Imprecise victim localisation | Rescue teams dispatched to approximate areas, not coordinates |
| F3 | Unoptimised resource allocation | Some shelters overflow while others sit at 30% capacity |
| F4 | Duplicate and fraudulent reports | Rescue capacity wasted on non-existent incidents |
| F5 | No authoritative citizen channel | Rumour propagation, panic movement |

**NDMS** is a unified, geospatially-aware, real-time platform that maintains a single canonical incident record and projects role-specific views of it to every stakeholder.

### 1.1 Design Thesis (state this in your viva)

> One incident record, seven views.

A citizen SOS, a government map pin, a rescue mission, a hospital pre-arrival alert, and a shelter intake entry are **not five separate objects**. They are five projections of one `incident` row plus its state transitions. Building it this way is what makes NDMS a *system* rather than seven CRUD apps in a trench coat.

---

## 2. Scope Discipline

### 2.1 What we are cutting, and why

| Originally proposed | Decision | Reasoning |
|---|---|---|
| Kubernetes | **CUT** — use Docker Compose | K8s costs ~3 weeks and adds zero marks. Mention it as "future scale-out" in the report |
| Real IoT hardware | **SIMULATE** | Buy nothing. Write a Python publisher that pushes synthetic water-level/smoke telemetry over MQTT. Functionally identical to the grader |
| Multi-state deployment | **CUT** | You cannot get real multi-state data. Do one district *properly* |
| Multi-language support | **DEFER to Major, i18n scaffold only** | Add `next-intl` with English + Hindi. Two languages proves the pattern |
| NGO module | **DEFER to Major** | Overlaps heavily with Shelter module |
| Hospital module | **DEFER to Major** | Needs bed-allocation logic — real work, not minor-scope |
| Risk prediction (LSTM) | **DOWNGRADE to statistical model** | You will not obtain a clean multi-decade river-gauge dataset. Use gradient boosting on synthetic + IMD open data |
| Route optimisation | **KEEP — this is your strength** | Graph algorithms on a road network with dynamic edge weights. Directly leverages your CP background |
| Digital Twin simulation | **KEEP — this is your differentiator** | Rare in college projects, algorithmically rich, demos beautifully |

### 2.2 Final Minor Scope (7 deliverables, 12 weeks)

1. Authentication + RBAC (5 roles)
2. Incident reporting with media upload and geolocation
3. Interactive live map (Leaflet + PostGIS)
4. Shelter locator with capacity tracking
5. Government dashboard (counts, severity heatmap, resource table)
6. Rescue team dashboard with mission assignment
7. Real-time notifications (Socket.IO) + volunteer registration

### 2.3 Final Major Scope (6 deliverables, 16 weeks)

1. Duplicate & fake report detection (embedding + spatial clustering)
2. Priority scoring model (ML classifier)
3. Damage detection from aerial imagery (YOLOv8 segmentation)
4. Hazard-aware route optimisation (modified A* on dynamic road graph)
5. **Digital Twin flood simulation engine**
6. Offline-first citizen PWA with conflict-resolving sync + IoT telemetry ingestion + analytics dashboard

---

## 3. Technology Stack (final)

### 3.1 Frontend
```
Next.js 14 (App Router)      — SSR for dashboards, PWA for citizen app
TypeScript                   — non-negotiable, you will thank yourself
Tailwind CSS + shadcn/ui     — do not hand-write CSS
React-Leaflet + Leaflet.markercluster — maps (free, no Mapbox token limits)
TanStack Query               — server state, caching, optimistic updates
Zustand                      — client state (offline queue lives here)
Recharts                     — dashboard charts
socket.io-client             — realtime
Dexie.js (IndexedDB)         — offline storage
Workbox                      — service worker
```

### 3.2 Backend
```
Node.js 20 + NestJS          — modules/guards/DI map perfectly to RBAC
Prisma ORM                   — but raw SQL for all PostGIS queries
Socket.IO                    — realtime gateway
BullMQ (Redis)               — job queue for AI dispatch, notifications
Zod / class-validator        — request validation
JWT (access + refresh)       — auth
Multer + MinIO (S3-compatible) — media storage, self-hosted
```

### 3.3 Data
```
PostgreSQL 16 + PostGIS 3.4  — primary store, all geospatial
Redis 7                      — cache, pub/sub, BullMQ, rate limiting, geo-sets
TimescaleDB extension        — IoT telemetry hypertable (Major)
```

### 3.4 AI Service (separate process)
```
Python 3.11 + FastAPI        — model serving
PyTorch + Ultralytics YOLOv8 — damage segmentation
sentence-transformers        — all-MiniLM-L6-v2 for text embeddings
scikit-learn + XGBoost       — priority scoring, risk prediction
OpenCV                       — image preprocessing
NetworkX / custom C++ core   — routing + simulation graph work
Celery optional              — or just call from BullMQ over HTTP
```

> **Note for you specifically:** the routing engine and simulation core can be written in **C++** and exposed to Python via `pybind11`. This is a legitimate architectural choice (performance-critical inner loop), plays to your strengths, and is a genuinely impressive thing to defend in a viva.

### 3.5 Infrastructure
```
Docker + Docker Compose      — 6 services
GitHub Actions               — lint, test, build on push
Nginx                        — reverse proxy, TLS
Single VPS or AWS EC2 t3.medium — deployment target
Sentry (free tier)           — error tracking
```

---

## 4. System Architecture

### 4.1 Service Topology

```
                    ┌──────────────────────────┐
                    │   Nginx Reverse Proxy    │
                    └────┬─────────────────┬───┘
                         │                 │
              ┌──────────▼──────┐   ┌──────▼──────────┐
              │  Next.js Web    │   │  Next.js PWA    │
              │  (dashboards)   │   │  (citizen)      │
              └──────────┬──────┘   └──────┬──────────┘
                         │                 │
                    ┌────▼─────────────────▼────┐
                    │   NestJS API Gateway      │
                    │   REST + Socket.IO        │
                    └──┬────┬─────────┬─────┬───┘
                       │    │         │     │
        ┌──────────────▼┐ ┌─▼──────┐ ┌▼─────▼────────┐
        │ PostgreSQL    │ │ Redis  │ │  MinIO        │
        │ + PostGIS     │ │ +BullMQ│ │  (media)      │
        └───────────────┘ └───┬────┘ └───────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  FastAPI AI Service│
                    │  ├ dedup           │
                    │  ├ priority        │
                    │  ├ damage (YOLO)   │
                    │  ├ routing (C++)   │
                    │  └ simulation      │
                    └────────────────────┘
```

### 4.2 Why this split

The AI service is a **separate process, not a library**. Reasons you should be able to state:

- Model loading takes 3–8 seconds; you cannot block the Node event loop
- Python ML ecosystem cannot be embedded in Node without pain
- Independent scaling: one API instance, three inference workers
- Independent failure: if YOLO OOMs, SOS ingestion still works

Communication is **asynchronous via BullMQ**, not synchronous HTTP. An SOS is acknowledged to the citizen in <200 ms; the AI enrichment lands 2–10 seconds later and is pushed over WebSocket. Never make a life-safety path wait on a neural network.

---

## 5. Database Schema

### 5.1 Core DDL

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============ IDENTITY ============
CREATE TYPE user_role AS ENUM
  ('CITIZEN','VOLUNTEER','RESCUE_TEAM','SHELTER_MANAGER',
   'HOSPITAL_ADMIN','GOVT_OFFICIAL','NGO','ADMIN');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone         VARCHAR(15) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  role          user_role NOT NULL DEFAULT 'CITIZEN',
  is_verified   BOOLEAN DEFAULT FALSE,
  aadhaar_hash  TEXT,                  -- SHA-256, never store raw
  last_location GEOGRAPHY(POINT,4326),
  district_id   INT REFERENCES districts(id),
  fcm_token     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_role     ON users(role);
CREATE INDEX idx_users_location ON users USING GIST(last_location);

-- ============ GEOGRAPHY ============
CREATE TABLE districts (
  id       SERIAL PRIMARY KEY,
  name     VARCHAR(100) NOT NULL,
  state    VARCHAR(100) NOT NULL,
  boundary GEOGRAPHY(MULTIPOLYGON,4326) NOT NULL,
  centroid GEOGRAPHY(POINT,4326),
  population INT
);
CREATE INDEX idx_districts_boundary ON districts USING GIST(boundary);

CREATE TABLE villages (
  id          SERIAL PRIMARY KEY,
  district_id INT REFERENCES districts(id),
  name        VARCHAR(120),
  location    GEOGRAPHY(POINT,4326),
  population  INT,
  elevation_m NUMERIC(7,2)          -- from SRTM DEM, needed by simulation
);
CREATE INDEX idx_villages_location ON villages USING GIST(location);

-- ============ INCIDENTS (the canonical object) ============
CREATE TYPE disaster_type AS ENUM
  ('FLOOD','EARTHQUAKE','FIRE','CYCLONE','LANDSLIDE','BUILDING_COLLAPSE','OTHER');

CREATE TYPE incident_status AS ENUM
  ('REPORTED','VERIFIED','ASSIGNED','IN_PROGRESS','RESOLVED','REJECTED_DUPLICATE','REJECTED_FAKE');

CREATE TABLE incidents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id       UUID REFERENCES users(id),
  type              disaster_type NOT NULL,
  status            incident_status NOT NULL DEFAULT 'REPORTED',
  location          GEOGRAPHY(POINT,4326) NOT NULL,
  address_text      TEXT,
  district_id       INT REFERENCES districts(id),
  description       TEXT,
  people_affected   INT DEFAULT 1,
  has_elderly       BOOLEAN DEFAULT FALSE,
  has_children      BOOLEAN DEFAULT FALSE,
  has_injured       BOOLEAN DEFAULT FALSE,
  is_sos            BOOLEAN DEFAULT FALSE,

  -- AI-populated columns (nullable until enrichment completes)
  priority_score    NUMERIC(5,2),
  severity_level    SMALLINT CHECK (severity_level BETWEEN 1 AND 5),
  duplicate_of      UUID REFERENCES incidents(id),
  fake_probability  NUMERIC(4,3),
  ai_processed_at   TIMESTAMPTZ,
  description_embedding VECTOR(384),   -- pgvector; or store in a side table

  reported_at       TIMESTAMPTZ DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  client_uuid       UUID UNIQUE,       -- offline idempotency key
  created_offline_at TIMESTAMPTZ
);
CREATE INDEX idx_incidents_location ON incidents USING GIST(location);
CREATE INDEX idx_incidents_status   ON incidents(status);
CREATE INDEX idx_incidents_priority ON incidents(priority_score DESC NULLS LAST);
CREATE INDEX idx_incidents_time     ON incidents(reported_at DESC);

CREATE TABLE incident_media (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  media_type  VARCHAR(10),
  perceptual_hash BIGINT,              -- pHash for image-duplicate detection
  ai_labels   JSONB,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE incident_status_log (
  id          BIGSERIAL PRIMARY KEY,
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  from_status incident_status,
  to_status   incident_status NOT NULL,
  changed_by  UUID REFERENCES users(id),
  note        TEXT,
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============ RESCUE ============
CREATE TABLE rescue_teams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(120) NOT NULL,
  agency          VARCHAR(50),         -- NDRF / SDRF / FIRE / POLICE
  team_size       INT,
  capabilities    TEXT[],              -- {'WATER_RESCUE','MEDICAL','HEAVY_LIFT'}
  base_location   GEOGRAPHY(POINT,4326),
  current_location GEOGRAPHY(POINT,4326),
  is_available    BOOLEAN DEFAULT TRUE,
  district_id     INT REFERENCES districts(id),
  last_ping_at    TIMESTAMPTZ
);
CREATE INDEX idx_teams_current_loc ON rescue_teams USING GIST(current_location);

CREATE TABLE missions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id   UUID REFERENCES incidents(id),
  team_id       UUID REFERENCES rescue_teams(id),
  assigned_by   UUID REFERENCES users(id),
  status        VARCHAR(20) DEFAULT 'ASSIGNED',
  route_geojson JSONB,
  eta_minutes   INT,
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,
  reached_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  people_rescued INT,
  notes         TEXT
);

-- ============ SHELTERS ============
CREATE TABLE shelters (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(150) NOT NULL,
  manager_id        UUID REFERENCES users(id),
  location          GEOGRAPHY(POINT,4326) NOT NULL,
  address           TEXT,
  district_id       INT REFERENCES districts(id),
  total_capacity    INT NOT NULL,
  current_occupancy INT DEFAULT 0,
  is_operational    BOOLEAN DEFAULT TRUE,
  contact_phone     VARCHAR(15),
  facilities        TEXT[],
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT occupancy_valid CHECK (current_occupancy >= 0)
);
CREATE INDEX idx_shelters_location ON shelters USING GIST(location);

CREATE TABLE shelter_inventory (
  id         BIGSERIAL PRIMARY KEY,
  shelter_id UUID REFERENCES shelters(id) ON DELETE CASCADE,
  item_type  VARCHAR(50),     -- FOOD_PACKET / WATER_LITRE / MEDICAL_KIT / BLANKET
  quantity   INT NOT NULL DEFAULT 0,
  unit       VARCHAR(20),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shelter_id, item_type)
);

-- ============ VOLUNTEERS ============
CREATE TABLE volunteer_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  skills            TEXT[],   -- {'DOCTOR','DRIVER','SWIMMER','ELECTRICIAN'}
  availability      BOOLEAN DEFAULT TRUE,
  service_radius_km INT DEFAULT 10,
  verification_status VARCHAR(20) DEFAULT 'PENDING',
  verified_by       UUID REFERENCES users(id),
  tasks_completed   INT DEFAULT 0,
  rating            NUMERIC(3,2)
);

CREATE TABLE volunteer_tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id  UUID REFERENCES incidents(id),
  shelter_id   UUID REFERENCES shelters(id),
  volunteer_id UUID REFERENCES users(id),
  title        VARCHAR(200),
  required_skill VARCHAR(50),
  status       VARCHAR(20) DEFAULT 'OPEN',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============ HOSPITALS (Major) ============
CREATE TABLE hospitals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(150),
  location        GEOGRAPHY(POINT,4326),
  district_id     INT REFERENCES districts(id),
  total_beds      INT, available_beds INT,
  icu_total       INT, icu_available  INT,
  ambulances_total INT, ambulances_free INT,
  has_trauma_unit BOOLEAN DEFAULT FALSE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_hospitals_location ON hospitals USING GIST(location);

CREATE TABLE blood_inventory (
  hospital_id UUID REFERENCES hospitals(id) ON DELETE CASCADE,
  blood_group VARCHAR(5),
  units       INT DEFAULT 0,
  PRIMARY KEY (hospital_id, blood_group)
);

-- ============ ROAD NETWORK (routing + simulation) ============
CREATE TABLE road_nodes (
  id       BIGINT PRIMARY KEY,           -- OSM node id
  location GEOGRAPHY(POINT,4326) NOT NULL,
  elevation_m NUMERIC(7,2)
);
CREATE INDEX idx_road_nodes_loc ON road_nodes USING GIST(location);

CREATE TABLE road_edges (
  id           BIGSERIAL PRIMARY KEY,
  from_node    BIGINT REFERENCES road_nodes(id),
  to_node      BIGINT REFERENCES road_nodes(id),
  geometry     GEOGRAPHY(LINESTRING,4326),
  length_m     NUMERIC(10,2),
  road_class   VARCHAR(30),
  base_speed_kmph NUMERIC(5,2),
  is_bridge    BOOLEAN DEFAULT FALSE,
  is_blocked   BOOLEAN DEFAULT FALSE,     -- set by hazard reports
  hazard_multiplier NUMERIC(5,2) DEFAULT 1.0
);
CREATE INDEX idx_road_edges_from ON road_edges(from_node);
CREATE INDEX idx_road_edges_geom ON road_edges USING GIST(geometry);

-- ============ IoT TELEMETRY (Major, TimescaleDB) ============
CREATE TABLE sensors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_type VARCHAR(30),   -- WATER_LEVEL / RAINFALL / SMOKE / SEISMIC
  location    GEOGRAPHY(POINT,4326),
  district_id INT REFERENCES districts(id),
  danger_threshold NUMERIC(10,3),
  is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE sensor_readings (
  sensor_id UUID REFERENCES sensors(id),
  ts        TIMESTAMPTZ NOT NULL,
  value     NUMERIC(12,4) NOT NULL,
  PRIMARY KEY (sensor_id, ts)
);
SELECT create_hypertable('sensor_readings','ts');   -- TimescaleDB

-- ============ SIMULATION (Major) ============
CREATE TABLE simulations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by  UUID REFERENCES users(id),
  name        VARCHAR(150),
  district_id INT REFERENCES districts(id),
  scenario    JSONB NOT NULL,   -- {type, rainfall_mm, duration_h, epicenter, magnitude...}
  result      JSONB,            -- timeline, impacted villages, shelter load, gaps
  status      VARCHAR(20) DEFAULT 'QUEUED',
  runtime_ms  INT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 Geospatial queries you will actually use

```sql
-- Nearest available rescue team with a required capability
SELECT id, name,
       ST_Distance(current_location, $1::geography) AS metres
FROM rescue_teams
WHERE is_available
  AND 'WATER_RESCUE' = ANY(capabilities)
  AND ST_DWithin(current_location, $1::geography, 25000)
ORDER BY current_location <-> $1::geography
LIMIT 5;

-- Incidents inside a district polygon, unresolved, priority-ordered
SELECT i.* FROM incidents i
JOIN districts d ON d.id = $1
WHERE ST_Within(i.location::geometry, d.boundary::geometry)
  AND i.status NOT IN ('RESOLVED','REJECTED_DUPLICATE','REJECTED_FAKE')
ORDER BY i.priority_score DESC NULLS LAST;

-- Shelters with headroom, nearest first
SELECT id, name, total_capacity - current_occupancy AS free_beds,
       ST_Distance(location, $1::geography)/1000 AS km
FROM shelters
WHERE is_operational AND current_occupancy < total_capacity
ORDER BY location <-> $1::geography
LIMIT 10;

-- Spatial-temporal duplicate candidates (feeds the AI dedup step)
SELECT id, description, description_embedding
FROM incidents
WHERE type = $2
  AND ST_DWithin(location, $1::geography, 200)
  AND reported_at > NOW() - INTERVAL '30 minutes'
  AND status <> 'REJECTED_DUPLICATE';
```

> `<->` is the PostGIS KNN operator. It uses the GIST index for true nearest-neighbour ordering. Using `ORDER BY ST_Distance(...)` alone will do a sequential scan. Know this difference for your viva.

---

## 6. API Design

### 6.1 REST surface (NestJS controllers)

```
AUTH
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/otp/send
POST   /api/auth/otp/verify
GET    /api/auth/me

INCIDENTS
POST   /api/incidents                  (multipart: data + media)
POST   /api/incidents/sos              (fast path, minimal payload)
GET    /api/incidents                  ?bbox=&type=&status=&minPriority=
GET    /api/incidents/:id
PATCH  /api/incidents/:id/status       (GOVT_OFFICIAL, RESCUE_TEAM)
POST   /api/incidents/bulk-sync        (offline queue drain)

MISSIONS
POST   /api/missions/assign            (incidentId, teamId?)  auto-suggest if teamId null
GET    /api/missions/my                (rescue team scope)
PATCH  /api/missions/:id/status
POST   /api/missions/:id/location      (GPS ping, 15s interval)

SHELTERS
GET    /api/shelters/nearby            ?lat=&lng=&radius=
GET    /api/shelters/:id
PATCH  /api/shelters/:id/occupancy
PATCH  /api/shelters/:id/inventory

VOLUNTEERS
POST   /api/volunteers/register
GET    /api/volunteers/tasks/nearby
POST   /api/volunteers/tasks/:id/accept
PATCH  /api/volunteers/:id/verify      (GOVT_OFFICIAL only)

DASHBOARD
GET    /api/dashboard/summary          ?districtId=
GET    /api/dashboard/heatmap          ?bbox=&hours=
GET    /api/dashboard/resources

AI  (Major)
POST   /api/ai/damage-detect
GET    /api/ai/risk-forecast           ?districtId=
POST   /api/ai/route                   (from, to, avoidHazards)
POST   /api/simulations
GET    /api/simulations/:id
```

### 6.2 Socket.IO event contract

```
ROOMS
  district:{id}      — all officials of a district
  team:{teamId}      — one rescue team
  incident:{id}      — reporter + assigned team + officials
  role:GOVT_OFFICIAL — broadcast channel

SERVER → CLIENT
  incident:created         { incident }
  incident:enriched        { id, priorityScore, severity, duplicateOf, fakeProbability }
  incident:status_changed  { id, from, to, by }
  mission:assigned         { mission, incident }
  mission:location         { missionId, lat, lng, ts }
  shelter:capacity_changed { shelterId, occupancy, capacity }
  alert:broadcast          { severity, message, geofence }
  sensor:threshold_breach  { sensorId, type, value, threshold }

CLIENT → SERVER
  team:ping                { lat, lng }
  incident:subscribe       { incidentId }
  district:subscribe       { districtId }
```

### 6.3 The SOS fast path (critical design detail)

```
t=0ms     POST /api/incidents/sos
t=15ms    Validate + INSERT with status=REPORTED, priority=NULL
t=25ms    Enqueue BullMQ job "enrich-incident"
t=30ms    Emit incident:created to district room
t=40ms    HTTP 201 returned to citizen  ← citizen is done waiting
─────────────────────────────────────────
t=2s      Worker: dedup check (pgvector + PostGIS)
t=4s      Worker: priority model inference
t=5s      UPDATE incidents SET priority_score, severity_level, duplicate_of
t=5.1s    Emit incident:enriched → dashboards re-sort live
```

**Never** put model inference on the request path. If the AI service is down, SOS still works — it just arrives unscored, and the dashboard sorts it by recency. Graceful degradation is a system-design mark.

---

## 7. Module Implementation Notes

### 7.1 Citizen PWA
- SOS is a **hold-to-activate** button (3 s) to prevent accidental fires
- Capture `navigator.geolocation.getCurrentPosition` with `enableHighAccuracy:true`, timeout 10 s, fall back to last known
- Compress images client-side with `browser-image-compression` before upload (target 300 KB)
- Every submission gets a client-generated `client_uuid` — this is the idempotency key that makes retries safe
- Show live mission tracking once a team is assigned (map + ETA)

### 7.2 Offline mode (Major)
```
1. Service worker caches app shell + map tiles for the user's district
2. Submissions go into a Dexie table `outbox` with client_uuid
3. 'online' event → drain outbox via POST /api/incidents/bulk-sync
4. Server upserts on client_uuid → duplicate network retries are no-ops
5. Conflict rule: server timestamp wins for status; client timestamp
   preserved in created_offline_at for audit
```
Demo this by toggling airplane mode. It is a 30-second demo that convinces every examiner.

### 7.3 Government dashboard
Panels: live incident map with clustering, severity choropleth by district, KPI cards (active incidents, teams deployed, shelter utilisation %, people rescued today), resource table with low-stock highlighting, incident feed sorted by priority.

Do **not** poll every 2 seconds. Subscribe to `district:{id}` and patch the TanStack Query cache from socket events.

### 7.4 Rescue team dashboard
Mission list (accept / reject with reason), turn-by-turn view using the hazard-aware route polyline, one-tap status transitions (`EN_ROUTE → REACHED → RESCUING → COMPLETED`), background GPS ping every 15 s, offline mission cache.

---

## 8. AI Modules (Major Project)

### 8.1 Duplicate & Fake Report Detection — *build this first*

**Stage 1 — Spatial-temporal gate (SQL, cheap):**
Candidates = same `type`, within 200 m, within 30 min. Typically 0–5 rows.

**Stage 2 — Semantic similarity:**
`sentence-transformers/all-MiniLM-L6-v2` → 384-dim embedding of the description. Cosine similarity against candidates. Store with `pgvector`.

**Stage 3 — Media perceptual hash:**
`imagehash.phash()` on uploaded images. Hamming distance ≤ 8 → near-identical image. Catches the classic "old flood photo reposted" case.

**Decision:**
```python
score = 0.45*cosine_sim + 0.30*spatial_proximity + 0.25*phash_match
if score > 0.82: mark REJECTED_DUPLICATE, set duplicate_of
elif score > 0.65: flag for human review
```

**Fake signals (separate classifier / rule ensemble):**
| Signal | Weight |
|---|---|
| Reporter account age < 1 hour | high |
| EXIF GPS ≠ reported GPS by >5 km | very high |
| Image EXIF timestamp older than 24 h | very high |
| Reporter has ≥2 prior rejected reports | high |
| Reported location is a water body / uninhabited polygon | medium |
| No media attached + generic text | low |

Output `fake_probability`. Never auto-delete above a threshold — **route to human verification**. State this ethical stance explicitly in your report; auto-rejecting a real SOS is a fatal error class.

### 8.2 Priority Scoring

Features: `people_affected`, `has_elderly`, `has_children`, `has_injured`, `disaster_type`, `is_sos`, minutes since report, population density at location, distance to nearest available team, current district load.

Model: XGBoost regressor → score 0–100. Bootstrap training labels from a rule-based scorer over ~2000 synthetic incidents, then let officials override in the UI and retrain on those corrections. **Say this in the viva:** the human-override loop is your training data pipeline.

Hard override rules that bypass the model:
```
if has_injured and disaster_type in (FIRE, BUILDING_COLLAPSE): score = 100
if people_affected > 50: score = max(score, 90)
```

### 8.3 Damage Detection

- Model: YOLOv8n-seg, fine-tuned
- Datasets (all free): **xBD / xView2** (building damage, pre/post pairs), **SpaceNet 8** (flood + road), **FloodNet** (UAV flood imagery, well-suited to this project)
- Classes: `flooded_area`, `damaged_building`, `intact_building`, `blocked_road`, `debris`
- Train ~50 epochs on Colab T4, 640×640, target mAP50 > 0.60 — do not chase SOTA
- Output → GeoJSON polygons, written to a `damage_assessments` table, rendered as a map overlay
- Detected `blocked_road` polygons intersect `road_edges` → set `is_blocked = TRUE` → **feeds directly into the routing engine.** This linkage is the single best thing to demo.

### 8.4 Hazard-Aware Route Optimisation — *your algorithmic showcase*

This is not Google Maps. The cost function is the point.

```
w(e) = (length_m / effective_speed(e)) * hazard_multiplier(e)

effective_speed(e) = base_speed * traffic_factor(e)

hazard_multiplier(e):
    if e.is_blocked                      → ∞    (edge removed)
    if flood_depth(e) > 0.6 m            → ∞
    if flood_depth(e) in (0.3, 0.6]      → 4.0
    if e.is_bridge and upstream_alert    → 8.0
    if landslide_zone(e) and rain_24h>100→ 6.0
    else                                 → 1.0
```

Algorithm: **A\*** with a great-circle admissible heuristic `h(n) = haversine(n, goal) / max_speed`. Bidirectional A* if the district graph exceeds ~200k edges.

Extensions worth implementing (each is a viva talking point):
- **k-shortest paths (Yen's algorithm)** — give the team 3 route options with different risk profiles
- **Time-dependent edges** — flood depth is a function of `t`, so the cost of edge *e* depends on arrival time at its tail node. This is genuinely non-trivial and impressive
- **Multi-source Dijkstra** — one pass from all shelters simultaneously gives every village its nearest-shelter assignment in O(E log V)

Implement the core in C++ (`pybind11` binding). Load the district graph once into memory at service start; do not query PostGIS per node expansion.

### 8.5 Resource Optimisation

Model as **min-cost flow**:
- Sources: warehouses/NGO depots with supply `s_i`
- Sinks: shelters with demand `d_j = f(occupancy, current_stock, projected_intake)`
- Edge cost: route travel time from §8.4
- Solve with network simplex (`scipy.optimize.linprog` or OR-Tools, or your own MCMF — you can write SPFA-based MCMF from memory)

Output: a dispatch table — *"Truck T3: Depot-A → Shelter-7, 400 food packets, 62 min via NH-27 bypass."*

### 8.6 Risk Prediction

Inputs: IMD rainfall (24 h / 72 h), CWC river gauge level, soil saturation proxy, elevation, historical flood occurrence, slope (for landslide).

Model: XGBoost classifier per hazard → probability per district per day. Do **not** attempt an LSTM; you lack the data volume and it will underperform a well-featured GBM.

Output feeds an alert engine: probability > 0.7 → broadcast a geofenced `alert:broadcast` to all users in the district polygon.

---

## 9. Digital Twin Simulation Engine — *the differentiator*

### 9.1 What it does

Answer counterfactuals **before** the disaster: *"If Kosi basin receives 250 mm rainfall over 12 hours, which villages flood at which hour, which shelters overflow, how many teams are short, and where should we pre-position?"*

### 9.2 Flood propagation model

Do not attempt full hydrodynamic simulation (Saint-Venant equations). Use a **cellular-automata flood-fill over a DEM raster** — physically plausible, computationally cheap, defensible.

```
INPUT:  DEM raster (SRTM 30 m) clipped to district
        rainfall_mm, duration_hours, source_nodes (river points)
        infiltration_rate, timestep Δt = 15 min

STATE:  water_depth[x][y]  (initialised 0)

FOR each timestep t:
    1. Add rainfall: depth[x][y] += (rain_rate * Δt) / 1000
    2. Add source discharge at river nodes
    3. Subtract infiltration: depth -= min(depth, infil_rate * Δt)
    4. FLOW STEP — for each cell, compute head H = elevation + depth
       Distribute water to the 8 neighbours with lower H,
       proportional to (H_self − H_neighbour), capped by
       Manning-derived flow limit
    5. Record snapshot every 4 timesteps (hourly)
```

Implementation notes:
- This is a stencil computation over a 2D grid — vectorise with NumPy (`np.roll` for the 8 neighbours) or write it in C++ for a 50× speedup
- A 1000×1000 grid × 48 timesteps runs in ~2 s in C++, ~25 s in vectorised NumPy
- Priority-queue variant: for a "final extent only" query, this reduces to a **Dijkstra-like flood fill** where cost = terrain head. That is a direct, elegant use of your CP toolkit

### 9.3 Impact assessment pipeline

```
For each hourly snapshot:
  a) Village impact
       flooded villages = villages where depth at their cell > 0.3 m
       affected population = Σ population of those villages
       first_impact_hour[village] = min t where flooded

  b) Road network degradation
       for each road_edge: sample depth along the LINESTRING
       depth > 0.6 m → is_blocked = TRUE in the simulation graph
       recompute connectivity (DSU / union-find)
       → detect isolated components = villages unreachable by road

  c) Shelter load assignment
       Multi-source Dijkstra from all shelters over the degraded graph
       Assign each affected village to nearest reachable shelter
       If a shelter's assigned population > capacity → OVERFLOW
       Reassign excess via min-cost flow to the next-nearest shelter
       with headroom; if none reachable → UNSERVED POPULATION

  d) Rescue capacity gap
       required_teams = ceil(affected_population / rescue_rate_per_team_per_hour)
       gap = required_teams − available_teams_in_district
       Compute pre-positioning: solve a p-median / facility-location
       problem to place `gap` teams minimising expected response time

  e) Evacuation routing
       For each village → assigned shelter, run hazard-aware A*
       on the graph state at that village's first_impact_hour
       (i.e. route on the network as it will be, not as it is)
```

### 9.4 Simulation output schema

```json
{
  "scenarioId": "uuid",
  "district": "Darbhanga",
  "input": { "type":"FLOOD", "rainfall_mm":250, "duration_h":12 },
  "timeline": [
    { "hour":3, "floodedAreaKm2":12.4, "villagesImpacted":2,
      "populationAffected":4100, "roadsBlocked":7 },
    { "hour":6, "floodedAreaKm2":48.9, "villagesImpacted":9,
      "populationAffected":23400, "roadsBlocked":31 }
  ],
  "shelterProjection": [
    { "shelterId":"...", "name":"Govt HS Singhwara",
      "capacity":800, "projectedIntake":1340,
      "overflowAt":"hour 7", "status":"OVERFLOW" }
  ],
  "isolatedVillages": ["Bela","Kamtaul"],
  "unservedPopulation": 3200,
  "rescueGap": { "required": 14, "available": 9, "shortfall": 5 },
  "recommendedPrePositioning": [
    { "lat":26.16, "lng":85.89, "teams":3,
      "rationale":"covers 4 high-risk villages within 22 min" }
  ],
  "evacuationRoutes": [ { "village":"Bela", "shelterId":"...",
                          "geojson": {...}, "etaMinutes":41 } ]
}
```

### 9.5 UI

Timeline scrubber over the map. Drag the slider → flood polygon grows, road edges turn red, shelter pins go green → amber → red. Side panel shows the metrics for the selected hour. **This single screen is your demo.**

### 9.6 Validation

Reconstruct a historical event (2019 Patna floods, 2018 Kerala floods — inundation extents are published) and compare your simulated extent against the observed extent. Report **IoU (Intersection over Union)**. Anything above 0.5 is a legitimate result for a simplified CA model, and reporting the number honestly is worth more than claiming perfection.

---

## 10. Security, Privacy, Ethics

| Area | Implementation |
|---|---|
| Auth | JWT access (15 min) + refresh (7 d, rotating, httpOnly cookie) |
| Passwords | Argon2id |
| RBAC | NestJS guards + `@Roles()` decorator; also enforce at query level |
| PII | Aadhaar stored as SHA-256 only; phone masked in all non-owner responses |
| Location privacy | Citizen location retained 30 days post-resolution, then coarsened to district |
| Rate limiting | SOS: 3/hour/user; reports: 10/hour; login: 5/15min |
| Media | Signed URLs, 15-min expiry; strip EXIF before public serving (retain for AI internally) |
| Audit | `incident_status_log` is append-only; every state change attributable |
| Transport | TLS everywhere; HSTS |
| AI ethics | No auto-rejection of any SOS. AI produces recommendations; humans decide. Log every AI decision with its inputs for post-hoc review |

Write §10 up properly. Examiners rarely see privacy reasoning in student projects and it is disproportionately rewarded.

---

## 11. Repository Structure

```
ndms/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .github/workflows/ci.yml
├── apps/
│   ├── web/                  # Next.js — dashboards
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   ├── (citizen)/    # PWA routes
│   │   │   ├── (govt)/dashboard/
│   │   │   ├── (rescue)/missions/
│   │   │   └── (shelter)/
│   │   ├── components/map/   # Leaflet wrappers
│   │   ├── lib/socket.ts
│   │   ├── lib/offline/      # Dexie outbox
│   │   └── public/sw.js
│   │
│   └── api/                  # NestJS
│       ├── src/
│       │   ├── auth/
│       │   ├── incidents/
│       │   ├── missions/
│       │   ├── shelters/
│       │   ├── volunteers/
│       │   ├── hospitals/
│       │   ├── dashboard/
│       │   ├── realtime/     # Socket.IO gateway
│       │   ├── queue/        # BullMQ producers + workers
│       │   └── common/       # guards, filters, geo utils
│       └── prisma/schema.prisma
│
├── services/
│   ├── ai/                   # FastAPI
│   │   ├── main.py
│   │   ├── dedup/
│   │   ├── priority/
│   │   ├── damage/
│   │   ├── routing/
│   │   └── models/
│   │
│   ├── simulation/           # Digital Twin
│   │   ├── engine.py
│   │   ├── core/             # C++ CA kernel + pybind11
│   │   ├── impact.py
│   │   └── data/dem/
│   │
│   └── iot-simulator/
│       └── publisher.py      # synthetic MQTT telemetry
│
├── packages/
│   ├── shared-types/         # TS types shared web↔api
│   └── ui/
│
├── infra/
│   ├── nginx/
│   └── seed/                 # SQL seeds + OSM import scripts
│
└── docs/
    ├── DFD.pdf
    ├── ER.png
    ├── API.md
    └── report/
```

---

## 12. Timeline

### 12.1 Minor Project — 12 weeks

| Week | Deliverable | Definition of Done |
|---|---|---|
| 1 | Setup | Docker Compose up: Postgres+PostGIS, Redis, API, Web. Repo + CI green |
| 2 | Schema + Auth | All Minor tables migrated. Register/login/refresh working, 5 roles, guards enforced |
| 3 | Incident CRUD | POST /incidents with media → MinIO. GET with bbox filter. Postman collection passing |
| 4 | Map v1 | Leaflet map renders incidents from bbox query. Marker clustering. Type-based icons |
| 5 | Citizen report UI | Full form, geolocation capture, image compress + upload, submission confirmation |
| 6 | SOS + Realtime | Socket.IO gateway, district rooms, `incident:created` reaches dashboard live |
| 7 | Shelter module | Shelter CRUD, `/shelters/nearby` KNN query, locator UI with distance sort |
| 8 | Govt dashboard | KPI cards, incident feed, severity heatmap, resource table. All socket-driven |
| 9 | Rescue dashboard | Team model, mission assign (manual + nearest-team suggest), status transitions, GPS ping |
| 10 | Volunteers + notify | Registration, skills, nearby task list, accept flow. FCM/web-push notifications |
| 11 | Seed + polish | 500 realistic seeded incidents, 20 shelters, 8 teams for one district. Responsive fixes |
| 12 | Test + docs + deploy | Jest unit + Supertest e2e on critical paths. Deploy to VPS. Report + DFD + ER + demo video |

**Week 12 hard rule:** feature freeze at start of week 11. Weeks 11–12 are stabilisation only.

### 12.2 Major Project — 16 weeks

| Week | Deliverable |
|---|---|
| 1 | AI service scaffold (FastAPI + Docker), BullMQ producer/consumer wiring, health checks |
| 2 | Dedup: spatial gate + MiniLM embeddings + pgvector. Measure precision/recall on labelled synthetic set |
| 3 | Fake detection: EXIF extraction, pHash, reporter-history signals, rule ensemble. Human-review queue UI |
| 4 | Priority model: feature pipeline, rule-based label bootstrap, XGBoost training, inference endpoint, override UI |
| 5 | Data acquisition: OSM road network import for target district (osmium + osm2pgsql), SRTM DEM download and clip |
| 6 | Routing engine v1: C++ A\* core + pybind11 binding, graph loader, `/ai/route` endpoint |
| 7 | Routing v2: dynamic hazard multipliers, time-dependent edges, Yen's k-shortest. Route polyline on rescue map |
| 8 | Damage detection: FloodNet/xBD dataset prep, YOLOv8-seg fine-tune on Colab, report mAP |
| 9 | Damage → GeoJSON pipeline, map overlay, `blocked_road` → `road_edges.is_blocked` linkage. **Demo the closed loop** |
| 10 | Simulation core: CA flood propagation over DEM, C++ kernel, snapshot serialisation |
| 11 | Simulation impact layer: village impact, DSU connectivity, multi-source Dijkstra shelter assignment |
| 12 | Simulation optimisation layer: min-cost-flow reallocation, p-median team pre-positioning, evacuation routes |
| 13 | Simulation UI: timeline scrubber, animated flood overlay, metrics panel, scenario builder form |
| 14 | Offline PWA: service worker, Dexie outbox, bulk-sync endpoint, conflict resolution. IoT simulator + threshold alerts |
| 15 | Analytics dashboard, i18n (EN/HI), risk-prediction model, alert broadcast engine |
| 16 | Validation study (historical event IoU), load test, hardening, final report, demo video |

---

## 13. Data Acquisition

See **Part B — Data Acquisition Handbook** at the end of this document for the full treatment: exact sources, download commands, licensing, and the seed script.

**Timing rule:** begin in Week 1, not Week 8. Data acquisition is the most common reason a well-architected student project ends up demoing on obviously fake data.

---

## 14. Testing Strategy

```
Unit (Jest)              — priority rules, geo utils, cost function
                           edge cases: ∞ weights, disconnected graph
Integration (Supertest)  — auth flows, RBAC denial paths, incident lifecycle
Geospatial (pgTAP/SQL)   — KNN correctness vs brute force on 1000 points
Algorithm correctness    — A* result == Dijkstra result on 100 random graphs
                           (this is your CP instinct; use it)
Simulation determinism   — same seed + same input → identical output hash
Load (k6)                — 500 concurrent SOS submissions, p95 < 500 ms
E2E (Playwright)         — citizen reports → official sees it → team assigned
Offline                  — Playwright with offline context, verify outbox drain
```

---

## 15. Demo Script (rehearse this — 8 minutes)

1. **(0:00)** Citizen phone: hold SOS → submitted, confirmation shown
2. **(0:20)** Government dashboard on second screen: pin appears live, no refresh
3. **(0:35)** Priority score populates 3 seconds later — explain the async enrichment
4. **(0:50)** Submit a near-identical report from another account → auto-flagged as duplicate
5. **(1:20)** Official assigns nearest team → rescue dashboard receives mission with route
6. **(1:50)** Route visibly avoids a flooded road segment; toggle the hazard off, route changes
7. **(2:30)** Upload aerial image → YOLO returns damage polygons → a road is marked blocked → **re-run the route, it changes again**
8. **(3:30)** Shelter fills to capacity → status flips red on all dashboards simultaneously
9. **(4:00)** Airplane mode → submit two reports → back online → both sync, no duplicates
10. **(5:00)** **Digital Twin:** enter 250 mm / 12 h scenario → run → scrub the timeline → show villages flooding in sequence, shelters overflowing at hour 7, and the pre-positioning recommendation
11. **(7:00)** Validation slide: simulated vs actual 2019 flood extent, IoU = 0.XX
12. **(7:30)** Architecture slide, close

Step 7 is the moment you win. It shows three subsystems (vision, geospatial, graph algorithms) composing into one behaviour.

---

## 16. Risk Register

| Risk | Probability | Mitigation |
|---|---|---|
| DEM/OSM data acquisition delays | High | Start Week 4; keep a synthetic-terrain fallback generator |
| YOLO training underperforms | Medium | Ship a lower mAP honestly; the pipeline matters more than the metric |
| Simulation too slow for live demo | Medium | Pre-compute 3 scenarios; cache results in `simulations.result` |
| Scope creep | **Very High** | Feature freeze dates are non-negotiable |
| Team member drops out | Medium | Keep the AI service decoupled — the Minor stands alone without it |
| Live demo network failure | Medium | Record a backup video; run everything on localhost during the demo |

---

## 17. Report Structure (for submission)

```
1. Introduction & Motivation
2. Literature Survey        — Sahana Eden, Ushahidi, NDMA's existing systems;
                              state their limitations, position NDMS against them
3. Problem Statement & Objectives
4. System Requirements      — functional, non-functional, hardware, software
5. System Design            — architecture, DFD L0/L1/L2, ER, sequence, use case
6. Database Design          — schema, normalisation, indexing rationale
7. Implementation           — module-wise, with key code listings
8. AI/ML Methodology        — datasets, preprocessing, architectures, hyperparameters
9. Digital Twin Simulation  — model, algorithms, complexity analysis
10. Results & Evaluation    — dedup P/R, YOLO mAP, route quality, simulation IoU,
                              load-test latency percentiles
11. Testing
12. Deployment
13. Limitations & Future Work
14. Conclusion
15. References
```

Section 10 is what separates a good project from an average one. Report **numbers**, including the unflattering ones.

---

## 18. Resume Framing

Do not write "made a disaster management website." Write:

> **National Disaster Management System** — Geospatial multi-agency coordination platform
> - Architected a real-time system serving 5 role-based clients over a single canonical incident model; sustained 500 concurrent submissions at p95 < 500 ms
> - Built a hazard-aware routing engine (C++ A\* with time-dependent edge costs, pybind11-bound) that reroutes around flooded segments detected by a YOLOv8 segmentation model
> - Designed a digital-twin flood simulator (cellular-automata propagation over 30 m DEM) computing village impact timelines, shelter overflow projection, and min-cost-flow resource reallocation; validated against the 2019 Bihar floods at IoU 0.XX
> - Reduced duplicate incident load by XX% using a three-stage pipeline (PostGIS spatial gate → sentence-embedding similarity → perceptual image hashing)
> - Implemented offline-first PWA sync with client-generated idempotency keys, eliminating duplicate writes across network partitions

Every bullet names a technique and a number. That is the format that gets interviews.

---

## 19. Immediate Next Actions

1. Create the monorepo and get `docker-compose up` running Postgres+PostGIS, Redis, API, and Web — **today**
2. Run the DDL in §5.1 and verify a GIST index is used: `EXPLAIN ANALYZE` the KNN query
3. Download the Geofabrik India OSM extract and the SRTM tiles for your target district — the download alone is slow, start it in the background
4. Pick the target district. Recommendation: a Bihar or Assam district with documented flood history and good OSM coverage — Darbhanga, Muzaffarpur, or Barpeta
5. Build the auth module and incident POST endpoint before touching any UI

---

*End of main plan. Part A (feature catalogue) and Part B (data acquisition) follow.*

---

# PART A — COMPLETE FEATURE CATALOGUE

Every feature in the system, split Minor vs Major, with how it is built and where its data comes from. This is the section to work from week to week. Effort estimates assume one person on that feature.

**How to read the Phase column**
- **M** = Minor project. Must exist and work for the minor submission.
- **J** = Major project. Built on top of a working minor.
- **M→J** = A basic version ships in Minor; the intelligent version replaces it in Major.

---

## A1. Citizen Portal

The citizen app is a **PWA, not a native app**. One codebase, installable on Android home screen, works offline, no Play Store review delay. For a college project this is strictly better than React Native.

### A1.1 Feature list

| # | Feature | Phase | Effort | Notes |
|---|---|---|---|---|
| C1 | Phone + OTP registration | M | 2 d | OTP is mocked in dev (always `123456`), real gateway in prod |
| C2 | SOS button | M | 3 d | The single most important screen in the project |
| C3 | Detailed incident report + media | M | 4 d | Type, description, people count, vulnerability flags, photos |
| C4 | My reports + live status timeline | M | 2 d | Citizen must see that something happened after they pressed SOS |
| C5 | Shelter finder | M | 2 d | Nearest shelters with free space, distance, directions link |
| C6 | Emergency contacts directory | M | 0.5 d | Static per-district list. Cheap, genuinely useful |
| C7 | Alert feed (geofenced) | M | 2 d | Receives broadcasts targeted at their area |
| C8 | Offline queue + background sync | M | 5 d | The hardest minor feature. Budget properly |
| C9 | Missing person report | J | 3 d | Photo + last-seen location + description; access-controlled |
| C10 | Multi-language (EN + HI) | J | 3 d | `next-intl`. Two languages proves the pattern |
| C11 | SMS fallback path | J | 3 d | For when there is no data connection at all |
| C12 | Live rescue tracking on map | J | 2 d | Citizen sees the assigned team's position approaching |

### A1.2 SOS button — implementation detail

This is the feature the evaluator will press. Get it right.

**Interaction design**
- Large circular button, minimum 88 px touch target
- **Three-second press-and-hold** with a filling progress ring, not a tap. Prevents pocket-triggers, and the ring gives visible feedback
- On release before 3 s: cancel silently
- On completion: haptic buzz (`navigator.vibrate(200)`), then immediate confirmation screen

**What gets sent**
```jsonc
POST /api/v1/incidents/sos
{
  "clientUuid": "9f2c…",        // generated on device, idempotency key
  "lat": 22.0797, "lon": 82.1409,
  "accuracyM": 18.4,
  "reportedAt": "2026-08-14T09:12:33.221Z",  // DEVICE time
  "type": "OTHER",               // refined later, do not block on this
  "peopleAffected": 1
}
```

Payload is deliberately tiny — under 300 bytes. On a congested 2G cell during a disaster, a 2 MB photo upload will fail while this succeeds. **Details and photos are added in a second, separate request.** Say this in the viva; it shows you thought about the actual failure environment.

**Geolocation handling**
```js
navigator.geolocation.getCurrentPosition(ok, fail, {
  enableHighAccuracy: true,
  timeout: 8000,           // do not hang forever
  maximumAge: 30000        // a 30-second-old fix is fine in an emergency
});
```
If GPS fails entirely, do **not** block the SOS. Send it with `lat/lon = null` and prompt for a manual map pin. A location-less SOS still tells the control room that someone in that cell tower's area needs help.

**Accuracy honesty.** Send `accuracyM` and render it as a translucent circle on the officer's map. If the fix is ±500 m, the rescue team must see a 500 m circle, not a deceptively precise pin.

### A1.3 Offline mode — implementation detail

Disasters destroy connectivity. This section carries real marks because most student projects ignore it.

**Three layers**

1. **Service worker (Workbox)**
   - App shell: `precache` — HTML, JS, CSS
   - Map tiles: `CacheFirst`, `ExpirationPlugin` capped at 300 entries
   - API GETs: `NetworkFirst` with 3 s timeout, falls back to cache
   - API POSTs: never cached — they go to the queue instead

2. **IndexedDB outbox** (use the `idb` library, not raw IndexedDB)
   ```js
   // schema
   outbox: { clientUuid (key), endpoint, payload, createdAt, attempts, lastError }
   ```
   Every write goes to the outbox *first*, then attempts network. This is the "outbox pattern" — the same technique used by offline-first messaging apps.

3. **Background Sync API**
   ```js
   await registration.sync.register('flush-outbox');
   ```
   The browser flushes the queue when connectivity returns — **even if the app is closed**. Fall back to an `online` event listener on browsers without Background Sync (iOS Safari).

**Server-side idempotency.** `POST /incidents/sync` accepts a batch. The `client_uuid UNIQUE` constraint makes replays harmless:
```sql
INSERT INTO incidents (client_uuid, ...) VALUES ($1, ...)
ON CONFLICT (client_uuid) DO UPDATE SET updated_at = NOW()
RETURNING id, (xmax = 0) AS was_inserted;
```
`xmax = 0` tells you whether it was a genuine insert or a duplicate replay — useful for the sync response and for your test assertions.

**Clock skew.** Device clocks lie. Preserve `reported_at` from the device but clamp it:
```
reported_at = clamp(device_time, server_now - 24h, server_now)
```
Prioritisation uses `reported_at`, because a report that sat in an offline queue for two hours is *older and more urgent* than one filed just now.

**Offline map tiles.** On first launch, offer to download the district's tiles for zoom 10–14. Roughly 30–60 MB. Ask permission — do not silently consume a user's data.

### A1.4 Degraded mode matrix

| Network | GPS | Behaviour |
|---|---|---|
| Online | Working | Full functionality |
| Online | Failed | Manual pin drop on live map |
| Offline | Working | Queue to outbox, show cached shelters, cached map |
| Offline | Failed | Queue with manual pin on cached map |
| 2G only | Working | Text-only mode: skip photos, send 300-byte SOS |
| No data at all | Any | SMS fallback: `SOS FLOOD 22.0797 82.1409` |

---

## A2. Government Dashboard

The command-and-control screen. This is what goes on the projector during your demo.

### A2.1 Feature list

| # | Feature | Phase | Effort | Notes |
|---|---|---|---|---|
| G1 | Live incident map with clustering | M | 5 d | Leaflet + markercluster + bbox queries |
| G2 | Prioritised incident queue | M→J | 3 d + 3 d | Rule-based in Minor, ML-scored in Major |
| G3 | KPI strip | M | 2 d | Active incidents, people affected, teams free, shelter load, avg response time |
| G4 | District severity choropleth | M | 2 d | `ST_Contains` aggregate, GeoJSON layer |
| G5 | Manual mission assignment | M | 3 d | Modal showing 5 nearest available teams with distance |
| G6 | Filters (type, status, severity, time) | M | 2 d | All server-side, never client-side on 5000 rows |
| G7 | Alert broadcast composer | M | 2 d | Draw a polygon on the map, pick roles, send |
| G8 | Resource overview table | M | 2 d | Shelter and stock levels across the district |
| G9 | AI priority score + SHAP explanation | J | 3 d | "Priority 87 because: 3 children (+22), water 2.1 m (+18)" |
| G10 | Needs-review bucket | J | 2 d | Suspected duplicates and fakes, human decides |
| G11 | Analytics dashboard | J | 4 d | Response time trends, incident heatmaps over time, team utilisation |
| G12 | Simulation tab with time slider | J | 5 d | The differentiator. See Part D |
| G13 | Auto-dispatch rules | J | 3 d | Optional rule: auto-assign if priority > 90 and a team is within 5 km |

### A2.2 Map performance — the thing that will break

Naively rendering 5,000 markers freezes the browser. Three defences, all required:

**1. Bounding-box queries.** Never fetch all incidents. Fetch what is on screen:
```sql
SELECT id, type, priority_score, ST_AsGeoJSON(location)::json AS geom
FROM incidents
WHERE status NOT IN ('RESOLVED','REJECTED_DUPLICATE','REJECTED_FAKE')
  AND location && ST_MakeEnvelope($1,$2,$3,$4, 4326)::geography
LIMIT 2000;
```
The `&&` operator is a bounding-box overlap test that uses the GiST index. It is far cheaper than `ST_Intersects` and correct for this purpose.

**2. Server-side clustering at low zoom.** Below zoom 12, do not send individual points at all:
```sql
SELECT ST_AsGeoJSON(ST_Centroid(ST_Collect(location::geometry)))::json AS geom,
       COUNT(*) AS n, ROUND(AVG(priority_score)) AS avg_priority
FROM incidents
WHERE location && ST_MakeEnvelope($1,$2,$3,$4,4326)::geography
GROUP BY ST_SnapToGrid(location::geometry, $5);   -- $5 = grid size by zoom
```

**3. Client-side `leaflet.markercluster`** for the remaining points at high zoom.

**Test this in week 4, not week 11.** Seed 5,000 incidents and measure. If you discover the problem during demo prep, you have no time to fix it.

### A2.3 The queue panel is the product

The map is what people photograph; the queue is what actually gets used. Each row shows:

```
🔴 92  FLOOD · 1.2 km · 4 people (2 children) · 14 min ago · Bilha    [Assign ▾]
```

Sorted by `priority_score DESC NULLS LAST, reported_at ASC`. The `NULLS LAST` matters — a report that has not been scored yet must not sort to the top or vanish to the bottom; it sits after scored items but is still visible.

The Assign dropdown opens the nearest-team modal. One click from seeing a problem to dispatching a team. If assignment takes four clicks, nobody will use it.

---

## A3. Rescue Team Dashboard

Mobile-first. The user is standing in rain, wearing gloves, on a cracked screen, on 2G.

### A3.1 Feature list

| # | Feature | Phase | Effort | Notes |
|---|---|---|---|---|
| R1 | Assigned mission list | M | 2 d | Sorted by priority, big cards |
| R2 | Mission status flow | M | 2 d | CREATED→ACCEPTED→EN_ROUTE→ON_SITE→COMPLETED |
| R3 | Victim details + contact | M | 1 d | Phone visible only for assigned missions |
| R4 | GPS ping (throttled) | M | 2 d | 1 per 10 s, batched to DB every 30 s |
| R5 | Basic route to incident | M | 2 d | OSRM public demo server or straight-line + distance |
| R6 | Rescue outcome form | M | 1 d | People rescued, injuries, hospital needed |
| R7 | Hazard-aware route | J | 5 d | Custom A* over the road graph. See Part C |
| R8 | Live re-route on new blockage | J | 3 d | Push a new route when a road closes mid-mission |
| R9 | Hospital handoff | J | 2 d | Nearest suitable hospital, pre-alert sent |
| R10 | Offline mission cache | J | 2 d | Mission details + route survive signal loss |

### A3.2 GPS throttling — the backpressure problem

15 teams × 1 ping/second = 1,296,000 DB writes per day for data nobody reads at that granularity.

```
Client:  throttle to 1 ping / 10 s, skip if moved < 20 m
   ↓
Redis:   SET team:{id}:loc  (live position, read by dashboards)
   ↓
Batch:   every 30 s, flush accumulated positions to Postgres for the audit trail
```

This is worth explaining in the viva. It shows you distinguish between **live state** (Redis, ephemeral, read constantly) and **historical record** (Postgres, durable, read rarely).

### A3.3 Why show the avoided hazard on the route

When the app routes a team 4 km around instead of 1.5 km straight, the team will ignore it and take the short road — unless they can see *why*. Render the flooded segment in red with a label. Trust in the routing is a feature, not decoration.

---

## A4. Shelter & Hospital Modules

### A4.1 Feature list

| # | Feature | Phase | Effort | Notes |
|---|---|---|---|---|
| S1 | Shelter CRUD | M | 2 d | Admin-created, manager-maintained |
| S2 | Occupancy tracking (atomic delta) | M | 2 d | Concurrency-safe. See below |
| S3 | Supply stock levels | M | 2 d | Food, water, medkits, blankets |
| S4 | 85% capacity auto-alert | M | 1 d | Emits socket event + flags on map |
| S5 | Public shelter locator API | M | 1 d | Feeds the citizen app |
| S6 | Hospital module | J | 4 d | Beds, ICU, blood, ambulances, specialities |
| S7 | Nearest-suitable-hospital matching | J | 3 d | Weighted multi-criteria scoring |
| S8 | Resource transfer planning | J | 4 d | OR-Tools min-cost flow. See Part C |
| S9 | Demand forecasting from simulation | J | 2 d | Uses digital twin output |

### A4.2 Occupancy concurrency — a real bug you will otherwise ship

Two staff members register arrivals simultaneously. Read-modify-write loses one:

```js
// WRONG — lost update
const s = await getShelter(id);
await setOccupancy(id, s.occupancy + 12);
```

```sql
-- RIGHT — atomic, and refuses to exceed capacity
UPDATE facilities
SET occupancy = LEAST(occupancy + $2, capacity),
    updated_at = NOW()
WHERE id = $1
RETURNING occupancy, capacity;
```

Expose it as `PATCH /facilities/:id/occupancy { "delta": 12 }`, not `{ "occupancy": 187 }`. The API shape enforces the correct semantics.

### A4.3 Hospital matching score

```
score = 0.40 × normalised_proximity
      + 0.25 × bed_availability_ratio
      + 0.20 × speciality_match
      + 0.15 × blood_availability
```

Return the **top 3**, never a single answer. The dispatcher needs a fallback when the first hospital says no, and a system that hides alternatives will be worked around within a day.

Hospital attributes live in a JSONB column so the schema does not need migration for every new field:
```json
{
  "total_beds": 220, "occupied_beds": 187,
  "icu_beds": 12, "icu_occupied": 9,
  "blood": {"A+": 8, "B+": 14, "O+": 3, "O-": 0, "AB+": 5},
  "ambulances": {"total": 6, "available": 2},
  "doctors_on_duty": 14,
  "specialities": ["TRAUMA", "ORTHO", "BURNS"]
}
```

---

## A5. Volunteer & NGO Modules

| # | Feature | Phase | Effort | Notes |
|---|---|---|---|---|
| V1 | Volunteer registration + skill tags | M | 2 d | `skills TEXT[]` — DOCTOR, DRIVER, SWIMMER, ENGINEER |
| V2 | Document upload + officer verification | M | 2 d | Only verified volunteers get tasks |
| V3 | Nearby task matching | M | 3 d | Spatial + skill intersection |
| V4 | Task accept / decline / complete | M | 2 d | Simple state machine |
| V5 | NGO shortage dashboard | J | 3 d | Computed demand vs current stock |
| V6 | Donation pledge tracking | J | 3 d | Records, **not** payment integration |
| V7 | Volunteer reliability score | J | 2 d | Accepted-and-completed ratio |

**Task matching query:**
```sql
SELECT t.id, t.title, ST_Distance(t.location, v.last_known) AS dist_m
FROM tasks t
JOIN users v ON v.id = $1
JOIN volunteer_profiles vp ON vp.user_id = v.id
WHERE t.status = 'OPEN'
  AND vp.availability = TRUE
  AND vp.verified_by IS NOT NULL
  AND ST_DWithin(t.location, v.last_known, vp.service_radius_km * 1000)
  AND (t.required_skills IS NULL OR t.required_skills && vp.skills)
ORDER BY dist_m
LIMIT 20;
```
`&&` on text arrays is the overlap operator — true if the volunteer has *any* required skill. Add a GIN index on `vp.skills`.

**On donations:** model pledges as records. Do **not** integrate a payment gateway. Real money in a student project means KYC, refunds, reconciliation, and audit obligations you cannot satisfy, and it adds nothing to your marks.

---

## A6. Cross-Cutting Platform Features

| # | Feature | Phase | Effort | Notes |
|---|---|---|---|---|
| P1 | JWT auth + refresh rotation | M | 3 d | Access 15 min, refresh 7 d |
| P2 | RBAC guard with district scoping | M | 2 d | Declarative `@Roles()` decorator |
| P3 | Socket.IO gateway + Redis adapter | M | 4 d | Rooms per district / team / user |
| P4 | Media upload to MinIO (presigned) | M | 2 d | Client uploads direct, API never proxies bytes |
| P5 | Rate limiting | M | 1 d | Redis sliding window; SOS endpoint exempted |
| P6 | Audit log for PII access | M | 1 d | Cheap to build, strong in the report |
| P7 | BullMQ job queue + workers | J | 3 d | The async enrichment backbone |
| P8 | IoT ingestion over MQTT | J | 3 d | Simulated sensors, real protocol |
| P9 | Prometheus + Grafana | J | 2 d | Optional. One good screenshot |
| P10 | i18n (EN + HI) | J | 3 d | `next-intl` |

### A6.1 Presigned uploads — why it matters

Do not accept file bytes through your API. Issue a presigned URL and let the browser upload directly to MinIO/S3:

```
1. POST /incidents/:id/media/presign  →  { uploadUrl, objectKey }
2. Browser PUTs the file straight to MinIO
3. POST /incidents/:id/media/confirm { objectKey }
```

Your Node process never buffers a 5 MB image. With 50 concurrent uploads this is the difference between a responsive API and a dead one.

---

## A7. Feature summary by phase

**Minor — 34 features, 12 weeks**
Auth and RBAC · SOS · incident reporting · media upload · live map · clustering · priority queue (rules) · KPIs · choropleth · filters · manual dispatch · rescue dashboard · mission lifecycle · GPS tracking · basic routing · shelter CRUD · occupancy · stock · capacity alerts · shelter locator · volunteer registration · verification · task matching · alert broadcast · notifications · offline queue · background sync · my-reports · emergency contacts · audit log · rate limiting · presigned uploads · seed data · Docker Compose

**Major — 28 features, 16 weeks**
Duplicate detection · fake detection · trust scoring · triage model · SHAP explanations · review bucket · damage segmentation · hazard zones from imagery · road graph ingestion · hazard-aware A\* · live re-routing · resource optimiser · transfer planning · hospital module · hospital matching · NGO dashboard · pledges · digital twin engine · flood propagation · impact projection · shelter overflow · team requirement · evacuation routing · simulation UI with time slider · analytics dashboard · IoT ingestion · i18n · missing persons

---

---

# PART B — DATA ACQUISITION HANDBOOK

**Start this in Week 1, not Week 8.** Data acquisition is the single most common reason student projects with good architecture end up demoing on fake data. Everything below is free and legally usable for academic work.

---

## B0. Choose your district first

Every dataset below is filtered by district. Pick one before downloading anything.

**Selection criteria, in order:**
1. Flood-prone with documented history — gives you a real scenario to simulate
2. Present in a public flood-imagery dataset — gives you real training labels
3. Reasonable size (1,500–4,000 km²) — a large district makes simulation slow
4. OSM road coverage is decent — check on openstreetmap.org before committing

**Reasonable candidates:** flood-prone districts along the Ganga–Brahmaputra basin (Bihar, Assam) have the most public flood data and the best coverage in the SAR datasets. A Chhattisgarh district along the Mahanadi works too and gives you local familiarity, at the cost of fewer ready-made flood labels.

**Record the decision in your report** with the bounding box and area. Then state: *"Demonstrated on District X. The architecture is district-agnostic; scaling to additional districts is a data-loading exercise, not a code change."* That is an honest and defensible claim.

---

## B1. Administrative boundaries

**Source:** DataMeet India Maps — community-maintained, MIT-licensed GeoJSON of Indian administrative boundaries.
**Repository:** `github.com/datameet/maps`
**Files needed:** `Districts/` and `Sub-districts/` GeoJSON.

**Load into PostGIS:**
```bash
# districts
ogr2ogr -f PostgreSQL \
  PG:"host=localhost dbname=ndms user=ndms password=ndms" \
  india_districts.geojson \
  -nln districts_raw -overwrite -lco GEOMETRY_NAME=geom -nlt MULTIPOLYGON \
  -t_srs EPSG:4326
```

```sql
-- keep only your district, cast to geography
INSERT INTO districts (name, state, boundary)
SELECT district, st_nm, ST_Multi(geom)::geography
FROM districts_raw
WHERE district ILIKE 'YOUR_DISTRICT';

-- sanity check: area in km²
SELECT name, ROUND((ST_Area(boundary)/1e6)::numeric, 1) AS area_km2 FROM districts;
```

If the area looks wrong by orders of magnitude, your SRID is wrong. `geography` computes in metres; `geometry` in EPSG:4326 computes in **degrees**, which is meaningless as area. This is the most common PostGIS beginner bug.

---

## B2. Villages and population

Two options. Use both if you can.

### Option 1 — WorldPop (recommended)
**Source:** `worldpop.org` — 100 m gridded population estimates, CC-BY licensed.
**Why:** already spatial, no name-matching required, and you can compute population inside *any* polygon — including a flood polygon. That last point is exactly what the digital twin needs.

```python
import rasterio
from rasterio.mask import mask
import geopandas as gpd

gdf = gpd.read_file("district.geojson").to_crs("EPSG:4326")
with rasterio.open("ind_ppp_2020_constrained.tif") as src:
    out, transform = mask(src, gdf.geometry, crop=True)
    total = out[out > 0].sum()
print(f"District population ≈ {total:,.0f}")
```

### Option 2 — Census of India 2011 village directory
**Source:** `censusindia.gov.in` — village-level population tables.
**Trade-off:** authoritative and citable, but joining village *names* to spatial geometries is painful. Names are transliterated inconsistently (Bilaspur / Bilāspur / Bilashpur). Budget a day for fuzzy matching, or use it only for headline numbers in your report.

**Village points** come from OSM:
```bash
osmium tags-filter district.osm.pbf \
  n/place=village,hamlet,town -o villages.osm.pbf
osmium export villages.osm.pbf -f geojson -o villages.geojson
```

Then assign each village a population by sampling the WorldPop raster in a 1 km buffer around its point. Document this as an estimate — it is, and saying so is better than implying precision you do not have.

---

## B3. Road network

**Source:** OpenStreetMap via Geofabrik regional extracts (ODbL licence — attribution required, include it in your report).

```bash
# 1. Download the state extract
wget https://download.geofabrik.de/asia/india/<state>-latest.osm.pbf

# 2. Clip to your district's bounding box
osmium extract -b <minlon>,<minlat>,<maxlon>,<maxlat> \
  <state>-latest.osm.pbf -o district.osm.pbf
```

**Build the routable graph** with `osmnx`:
```python
import osmnx as ox, geopandas as gpd

poly = gpd.read_file("district.geojson").geometry.iloc[0]
G = ox.graph_from_polygon(poly, network_type="drive", simplify=True)
G = ox.add_edge_speeds(G)          # infers speed from highway tag
G = ox.add_edge_travel_times(G)

nodes, edges = ox.graph_to_gdfs(G)
print(f"{len(nodes):,} nodes, {len(edges):,} edges")
nodes.to_postgis("road_nodes_raw", engine, if_exists="replace")
edges.to_postgis("road_edges_raw", engine, if_exists="replace")
```

A district of ~3,000 km² typically yields 40,000–120,000 edges. That is comfortably routable with A\* in Python for a demo, and fast in a compiled implementation.

**Speed defaults when OSM has no `maxspeed` tag** — document these in your report:

| `highway` tag | Assumed km/h |
|---|---|
| motorway / trunk | 80 |
| primary | 60 |
| secondary | 50 |
| tertiary | 40 |
| residential / unclassified | 30 |
| track | 15 |

---

## B4. Elevation (DEM) — required for the digital twin

The flood simulation is entirely driven by terrain. Without a DEM there is no digital twin.

| Source | Resolution | Access | Note |
|---|---|---|---|
| **Copernicus DEM GLO-30** | 30 m | AWS Open Data, no login | **Best option.** Modern, clean, direct download |
| SRTM 1 Arc-Second | 30 m | USGS EarthExplorer | Free login required. Older, more voids |
| CartoDEM (Bhuvan, ISRO) | 30 m | bhuvan.nrsc.gov.in | India-specific, registration required |

**Clip and downsample:**
```bash
# clip to district
gdalwarp -cutline district.geojson -crop_to_cutline \
  -dstnodata -9999 copernicus_dem.tif district_dem_30m.tif

# downsample to 90 m for interactive simulation
gdalwarp -tr 0.00081 0.00081 -r average \
  district_dem_30m.tif district_dem_90m.tif
```

**Why downsample.** A 3,000 km² district at 30 m is ~3.3 M cells. At 90 m it is ~370 k cells — nine times faster, and for a district-scale flood projection the extra resolution adds nothing you can act on. Keep the 30 m version for the report's methodology section; run the demo on 90 m.

**Fill sinks before simulating.** Raw DEMs contain artefact pits that trap water and produce nonsense lakes:
```python
import richdem as rd
dem = rd.LoadGDAL("district_dem_90m.tif")
rd.FillDepressions(dem, in_place=True)
rd.SaveGDAL("district_dem_filled.tif", dem)
```
Skipping this step is a classic mistake and produces visibly wrong output.

---

## B5. Shelters and hospitals

**Real shelter registries are not public.** Here is the honest workaround, and it is better than inventing coordinates.

In India, designated flood shelters are overwhelmingly **schools and community halls**. Extract those from OSM and treat them as candidate shelters:

```bash
osmium tags-filter district.osm.pbf \
  n,w/amenity=school,college,community_centre,shelter \
  n,w/amenity=hospital,clinic \
  -o facilities.osm.pbf
osmium export facilities.osm.pbf -f geojson -o facilities.geojson
```

Assign synthetic capacity by facility type:

| Type | Capacity heuristic |
|---|---|
| Primary school | 150 |
| Secondary school / college | 400 |
| Community centre | 200 |
| Purpose-built shelter | 800 |

**Hospitals** from OSM give you real names and real locations. Bed counts are not in OSM — synthesise them, scaled by whether the facility is tagged `hospital` or `clinic`.

**State this clearly in your report:** *"Facility locations are real, sourced from OpenStreetMap. Capacity and inventory figures are synthetic, generated by a documented heuristic, since operational registries are not publicly available."*

This is a strong position. Real geography with declared synthetic attributes is far more credible than plausible-looking invented data, and an examiner who probes it will find you already answered the question.

---

## B6. Weather and rainfall

**Use Open-Meteo. Not IMD.**

| | Open-Meteo | IMD |
|---|---|---|
| API key | Not required | No clean public API |
| Historical archive | 1940→present | Fragmented, mostly PDF |
| Forecast | 16 days | Available but hard to consume |
| Terms | Free for non-commercial | Unclear for redistribution |
| Reliability | Stable JSON | Scraping breaks constantly |

IMD is the authoritative Indian source and you should **cite** it in your literature review, but do not make your running system depend on scraping it.

```python
import requests

# forecast — hourly rainfall
r = requests.get("https://api.open-meteo.com/v1/forecast", params={
    "latitude": 22.08, "longitude": 82.14,
    "hourly": "precipitation,rain,soil_moisture_0_to_7cm",
    "forecast_days": 7, "timezone": "Asia/Kolkata"
}).json()

# historical — for training and for realistic simulation scenarios
h = requests.get("https://archive-api.open-meteo.com/v1/archive", params={
    "latitude": 22.08, "longitude": 82.14,
    "start_date": "2010-01-01", "end_date": "2024-12-31",
    "daily": "precipitation_sum", "timezone": "Asia/Kolkata"
}).json()
```

**Use the historical archive to build honest simulation presets.** Find the actual worst 24-hour rainfall in the last 15 years for your district and make that a scenario button. "250 mm in 24 h — the September 2019 event" is far more compelling than a slider someone dragged at random.

---

## B7. River levels — the hard one

**Be honest about this in your report.** The Central Water Commission publishes flood forecasts at India-WRIS (`indiawris.gov.in`), but there is no documented public API, and scraping government portals is fragile and can break the day before your demo.

**Recommended approach — provider abstraction:**

```python
class RiverLevelProvider(Protocol):
    def current_level(self, station_id: str) -> float: ...
    def history(self, station_id: str, days: int) -> list[Reading]: ...

class WrisScraperProvider:      # best-effort, may fail
    ...
class SimulatedProvider:        # deterministic, always works
    """Rainfall-driven synthetic gauge using a simple runoff model."""
    ...
```

Configure via environment variable. Demo runs on the simulator; the scraper demonstrates that real integration is a swap, not a rewrite.

**In the viva, say this plainly:** *"Real gauge integration is limited by data availability, not by architecture. The system reads from a provider interface; connecting a real CWC feed requires implementing one class."* That is a mature answer and it will land better than pretending you have live gauge data.

---

## B8. IoT sensors — simulate, do not buy

Buying sensors costs money, takes weeks to ship, breaks at the venue, and demonstrates nothing the simulator does not. Use **real MQTT with synthetic readings**.

```python
# tools/sensor_sim.py
import json, time, math, random
import paho.mqtt.client as mqtt

SENSORS = [
    {"id": "WL-001", "type": "WATER_LEVEL", "lat": 22.08, "lon": 82.14, "base": 1.2},
    {"id": "WL-002", "type": "WATER_LEVEL", "lat": 22.14, "lon": 82.21, "base": 0.8},
    {"id": "RN-001", "type": "RAINFALL",    "lat": 22.10, "lon": 82.17, "base": 0.0},
]

c = mqtt.Client(); c.connect("localhost", 1883)
t = 0
while True:
    for s in SENSORS:
        if s["type"] == "WATER_LEVEL":
            # slow diurnal drift + rising trend + noise
            v = s["base"] + 0.3*math.sin(t/60) + t*0.002 + random.gauss(0, 0.05)
        else:
            v = max(0, random.gauss(2.5, 3.0))
        c.publish(f"ndms/sensors/{s['type'].lower()}/{s['id']}",
                  json.dumps({"sensorId": s["id"], "type": s["type"],
                              "value": round(v, 3),
                              "lat": s["lat"], "lon": s["lon"],
                              "recordedAt": time.time()}))
    t += 1
    time.sleep(5)
```

Add a `--scenario flood` flag that ramps water level sharply. During the demo you trigger it, the threshold is crossed, and an alert fires live on screen. That is a far better demonstration than a physical sensor sitting on the table.

**Write in the report:** *"Telemetry is generated by a simulator publishing over MQTT to a Mosquitto broker. The ingestion path — broker, subscriber, validation, storage, threshold evaluation — is production-shaped; only the physical sensors are substituted."*

---

## B9. AI training datasets

### B9.1 Flood detection — use SAR, not optical

**This is the most important technical insight in this section.**

During a flood there are clouds. Optical satellites (Sentinel-2, Landsat) cannot see through clouds, so they are frequently useless at exactly the moment you need them. **Synthetic Aperture Radar penetrates cloud cover**, which is why operational flood mapping runs on SAR.

| Dataset | Content | Size | Best for |
|---|---|---|---|
| **Sen1Floods11** | Sentinel-1 SAR + hand-labelled flood masks, 11 global events | 4,831 chips (512×512) | **Primary choice.** Cloud-independent |
| **SpaceNet 8** | Flood + roads + buildings, pre/post pairs | ~850 km² | Combined flood and road-blockage task |
| **FloodNet** | UAV/drone imagery, flood segmentation | ~2,343 images | Matches the "drone" story in your proposal |
| **xBD / xView2** | Building damage, 4 damage classes, pre/post | ~850k buildings | Structural damage rather than flood extent |

Sen1Floods11 is on Google Cloud Storage and Radiant MLHub; FloodNet and xBD are on their project sites. All are free for research with attribution.

**Mentioning the SAR-versus-optical reasoning in your report is worth real marks.** Most student projects reach for Sentinel-2 because it looks like a photograph, and never notice the cloud problem.

### B9.2 Training recipe

```
1. Chip:      512×512 tiles, 64 px overlap
2. Split:     by geographic region, NOT randomly
3. Augment:   flips, 90° rotations. No colour jitter on SAR — it is not RGB
4. Model:     U-Net + ResNet34 encoder (segmentation_models_pytorch)
                or YOLOv8-seg if you prefer the Ultralytics workflow
5. Loss:      Dice + BCE. Flood pixels are a minority class
6. Metrics:   IoU per class, plus a confusion matrix
7. Output:    mask → polygons → hazard_zones table
```

**Split geographically, not randomly.** Random splitting puts adjacent overlapping tiles in both train and test, inflating your score by 10–20 points. An examiner who knows this will ask. Split by event or region and report the honest number.

**Compute:** Google Colab or Kaggle free GPUs. Checkpoint to Drive every epoch — sessions terminate without warning.

**The step most projects skip:** converting the model output into a database row.
```python
import rasterio.features as rf
from shapely.geometry import shape
from shapely.ops import unary_union

shapes = rf.shapes(mask.astype("uint8"), mask=mask > 0, transform=src.transform)
polys  = [shape(g) for g, v in shapes if v == 1]
flood  = unary_union(polys).simplify(0.0002)
# INSERT INTO hazard_zones (hazard_type, severity, source, confidence, geom) ...
```

A notebook that reports 0.82 IoU is a machine-learning exercise. A notebook whose output changes the route a rescue team is given is a **system**. Make sure yours is the second one.

### B9.3 Triage model training data — the honest problem

**There is no public dataset of "emergency reports labelled with correct rescue priority."** It does not exist. You have three options and only one is acceptable.

| Option | Verdict |
|---|---|
| Claim you have real NDRF dispatch data | **No.** This is fabrication and it will not survive a follow-up question |
| Skip the model, use pure rules | Acceptable but weak for a major project |
| Generate labels from a documented heuristic, train on that, declare it | **Correct.** Do this |

```python
def heuristic_priority(r) -> float:
    """Documented scoring function used to generate training labels.
    Weights derived from NDMA triage guidance and standard mass-casualty
    triage principles. Reproduced in the report, Appendix C."""
    s = 30.0
    s += {"MEDICAL": 25, "BUILDING_COLLAPSE": 30, "FLOOD": 20,
          "FIRE": 28, "MISSING_PERSON": 15}.get(r.type, 10)
    s += min(r.people_affected * 3, 20)
    s += 12 if r.has_children else 0
    s += 10 if r.has_elderly  else 0
    s += 15 if r.has_injured  else 0
    s += min(r.hours_waiting * 2.5, 15)
    s += r.water_depth_m * 6
    s -= min(r.km_to_nearest_team * 0.8, 10)
    return float(min(max(s, 0), 100))

# generate 20k synthetic reports with realistic feature distributions,
# label with heuristic_priority(), add Gaussian noise (σ ≈ 4),
# then train XGBoost to recover it.
```

**Why train a model to reproduce a rule you already wrote?** A fair question, and you must be able to answer it:

1. The model **generalises to feature combinations** the rule handles awkwardly — interactions the additive rule cannot express
2. It provides a **retrainable pipeline**. When real dispatch logs become available, you swap the labels and retrain. The rule cannot learn
3. It supports **SHAP explanations**, giving officers a per-incident breakdown
4. Comparing model output against the rule is itself a **measurable result** for your report

State the limitation openly: *"Labels are synthesised from a documented heuristic. The contribution is the pipeline and the explanation layer, not a claim of learned clinical triage."*

Volunteering this before you are asked converts a weakness into evidence of judgement.

---

## B10. Historical disaster records

For the literature survey and for validating your simulation.

| Source | Use |
|---|---|
| **EM-DAT** (emdat.be) | International disaster database. Free academic registration. Event dates, deaths, affected counts |
| **NDMA reports** (ndma.gov.in) | Indian policy framework, official guidelines — cite these for your problem statement |
| **India-WRIS flood atlas** | Historical inundation extents where available |
| **ReliefWeb** (reliefweb.int) | Situation reports from real responses. Excellent for grounding your problem statement in reality |

Use EM-DAT to find a real event in your district, then reproduce its rainfall in the simulator and compare your predicted flood extent against whatever documented extent you can find. Even a rough qualitative match — *"the simulation floods the same three blocks that the 2019 event affected"* — is a **validation result**, and almost no student project has one.

---

## B11. The seed script

Everything above converges into one command that produces a demo-ready database.

```
tools/seed.ts  or  tools/seed.py
├── 1. districts        (DataMeet GeoJSON)        →  1 row
├── 2. villages         (OSM + WorldPop)          →  ~200 rows, real coords
├── 3. road graph       (osmnx)                   →  ~60k edges, real
├── 4. facilities       (OSM schools/hospitals)   →  ~50 rows, real coords
├── 5. resource_stock   (heuristic)               →  synthetic quantities
├── 6. rescue_teams     (placed at real stations) →  15 rows, synthetic
├── 7. users            (5 roles × 3 accounts)    →  15 demo logins
├── 8. incidents        (spatially clustered)     →  500 rows, synthetic
└── 9. sensors          (near river geometry)     →  12 stations, synthetic
```

**Make the synthetic incidents realistic, not uniform.** Real emergencies cluster near rivers, near population, and in time. Uniform random scatter looks obviously fake on a map and undermines an otherwise good demo.

```python
# weight incident placement by flood risk and population
p_incident(cell) ∝ population(cell) × exp(-distance_to_river(cell) / 2000)
```

Add a deliberate duplicate cluster: 8 reports of one fire within 150 m and 12 minutes. During the demo you show them collapsing into one. That moment is the clearest possible proof that your de-duplication works.

**Determinism matters.** Seed the RNG with a fixed value so every run produces the identical dataset. You do not want your carefully rehearsed demo to reshuffle itself the morning of the presentation.

---

## B12. Data acquisition checklist

Work through this in the first three weeks.

- [ ] District selected, bounding box recorded, area computed
- [ ] District and sub-district boundaries loaded into PostGIS, area sanity-checked
- [ ] Village points extracted from OSM; population sampled from WorldPop
- [ ] OSM extract downloaded and clipped
- [ ] Road graph built with `osmnx`, node and edge counts recorded
- [ ] DEM downloaded, clipped, depression-filled, downsampled to 90 m
- [ ] Facilities extracted from OSM; synthetic capacities assigned by documented heuristic
- [ ] Open-Meteo tested for both forecast and historical archive
- [ ] Worst historical rainfall event identified and turned into a simulation preset
- [ ] `RiverLevelProvider` interface defined with a simulated implementation
- [ ] MQTT sensor simulator running against Mosquitto
- [ ] Sen1Floods11 (or FloodNet) downloaded, chipped, split **geographically**
- [ ] Triage heuristic written down and reviewed — it goes in the report appendix
- [ ] `seed.py` runs end to end and is deterministic
- [ ] Every dataset's licence and attribution recorded in `data/SOURCES.md`

**That last item is not optional.** OSM requires ODbL attribution, WorldPop requires CC-BY, and academic datasets require citation. A `SOURCES.md` file takes twenty minutes and protects you from a legitimate and awkward question in your viva.

---

# PART C — WEEK-ONE STARTING ORDER

Everything above is reference material. This is what you actually do first.

| Day | Task | Done when |
|---|---|---|
| 1 | Create monorepo, `docker-compose up` with Postgres+PostGIS, Redis, MinIO | `SELECT postgis_version();` returns a version |
| 1 | Pick the district. Record name, bbox, area | Written in `data/SOURCES.md` |
| 1 | Start the Geofabrik and DEM downloads in the background | Files landing on disk |
| 2 | Run the §5.1 DDL. Load district boundary | Area sanity-check passes |
| 2 | Write the five spatial queries from §5.2 by hand | `EXPLAIN ANALYZE` shows a GiST index scan, not a seq scan |
| 3 | Agree the OpenAPI contract across the whole team, commit it | All three members can mock each other |
| 3–4 | Auth module: OTP, JWT, refresh, `@Roles()` guard | All five roles log in via Postman |
| 5 | `POST /incidents` with real geometry + presigned media upload | A report created via Postman appears with valid `location` |

**Do not open a UI file until day 5.** A frontend built against an unstable API gets rewritten twice.

**The day-2 index check is not optional.** If your spatial queries are doing sequential scans on 500 rows you will not notice — and you will discover it at 50,000 rows during load testing in week 12, when there is no time to fix it.

---

*End of document.*
