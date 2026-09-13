# CLAUDE.md — National Disaster Management System (NDMS)

This file is read automatically at the start of every Claude Code session.
Read it fully before writing any code.

---

## 1. What we are building

A unified, multi-agency disaster-response coordination platform for one Indian
district. Citizens, government officials, rescue teams, shelters/hospitals and
volunteers all operate on **one shared geospatial data model**.

**The central design principle:** a citizen's SOS, an officer's map marker, a
rescue team's mission and a shelter's intake record are not four records. They
are four role-specific views of *one row* in the `incidents` table (plus its
related rows). This is why NDMS is one system, not seven apps.

**Two phases:**

| | Minor Project (BUILD THIS NOW) | Major Project (later) |
|---|---|---|
| Scope | Working coordination platform, **zero machine learning** | Intelligence layer on the same foundation |
| Duration | 12 weeks | 16 weeks |
| Features | 34 | 28 |
| Success test | An SOS on a real phone appears on the officer's map in under 5 s and reaches a rescue team | System ranks urgency, avoids flooded roads, simulates floods |

**Do not build Major-phase features unless I explicitly ask.** If a task looks
like it needs AI, stop and ask.

Full detail: `docs/NDMS_Implementation_Plan.md`. Read the relevant section
before starting a module — it has the schema, the API surface and the reasoning
behind each decision.

---

## 2. Tech stack — decided, do not substitute

| Layer | Choice | Non-obvious reason |
|---|---|---|
| Frontend | Next.js 14 App Router + TypeScript | Four portals as route groups in one codebase |
| Styling | Tailwind + shadcn/ui | Speed. Do not hand-write CSS |
| Maps | **Leaflet** + react-leaflet + leaflet.markercluster | Not Mapbox — no API key means nothing can expire mid-demo |
| Backend | NestJS 12 on **Node 24 LTS** + TypeScript **6.0** | Module/guard structure mirrors the DFD processes. Node 20 hit EOL 2026-04-30. TS stays on 6.0: ts-jest and typescript-eslint do not support TS 7 yet |
| Database | PostgreSQL 16 + **PostGIS 3.4** | Nearly every query here is spatial |
| ORM | Prisma **7.x** (`@prisma/adapter-pg`, CJS client) **+ raw SQL for all geometry** | Prisma cannot express PostGIS types. Use `$queryRaw`. Do not fight this. npm `latest` points at an 8.0 RC — stay on 7.x |
| Migrations | **dbmate**, plain forward-only SQL | Prisma Migrate treats PostGIS types and GiST indexes as drift. `schema.prisma` is introspected with `db pull`, never migrated |
| Realtime | Socket.IO + `@socket.io/redis-adapter` | Rooms give per-district / per-team broadcast free |
| Queue | BullMQ on Redis | Retries + inspectable dashboard |
| Cache/live state | Redis 7 | Live team positions live here, NOT in Postgres |
| Object storage | MinIO via the **`pgsty/minio`** community fork (S3-compatible) | Upstream stopped publishing images in Oct 2025. Code uses the S3 SDK, so it swaps to S3 (or Garage/SeaweedFS) via env vars |
| Containers | **Docker Compose only** | Kubernetes is explicitly out of scope |
| Tests | Jest + Supertest + **Testcontainers**, Playwright, k6 | Integration tests run against real PostGIS. Jest runs with `--experimental-vm-modules`, which it needs to `require()` the ESM-only Nest 12 packages |

---

## 3. Non-negotiable design rules

These came out of design review. Violating them is a bug, not a style choice.

1. **The SOS path never blocks on anything slow.**
   `POST /incidents/sos` → validate → insert → emit socket event → return.
   Target under 300 ms. Everything else is queued. If the queue, the worker or
   (later) the AI service is down, incidents must still flow.

2. **Idempotency on every write from a device.**
   The client generates `client_uuid`. The column has a `UNIQUE` constraint.
   Use `ON CONFLICT (client_uuid) DO UPDATE ... RETURNING id, (xmax = 0) AS was_inserted`.
   This is what makes offline retry safe.

3. **`reported_at` (device clock) is separate from `created_at` (server clock).**
   Clamp `reported_at` to `[server_now - 24h, server_now]`. Prioritise by
   `reported_at`, because a report queued offline for two hours is *older and
   more urgent*, not newer.

4. **Occupancy and stock are updated by delta, never by absolute value.**
   ```sql
   UPDATE facilities
   SET occupancy = LEAST(occupancy + $2, capacity), updated_at = NOW()
   WHERE id = $1 RETURNING occupancy, capacity;
   ```
   API shape is `PATCH /facilities/:id/occupancy { "delta": 12 }`.
   Read-modify-write loses concurrent updates from two staff members.

5. **Every geography column gets a GiST index, created in the same migration.**
   Missing indexes are invisible at 500 rows and fatal at 50,000.

6. **Live state vs durable record are different stores.**
   Team GPS: throttle client-side to 1 ping / 10 s, skip if moved < 20 m,
   write to Redis for display, flush to Postgres in 30 s batches.
   Do not write every ping to the database.

7. **Media never passes through the API.**
   Issue a presigned URL; the browser uploads directly to MinIO.
   `POST /media/presign` → browser PUTs → `POST /media/confirm`.

8. **Nothing is ever auto-rejected.** Uncertain reports go to a human review
   queue with status unchanged. This matters more in the Major phase, but build
   the review-queue path now.

9. **Map queries are always viewport-bounded.**
   Use `location && ST_MakeEnvelope($1,$2,$3,$4,4326)::geography` (bounding-box
   operator, index-served). Never `SELECT *` from incidents for a map.

---

## 4. Repository layout

```
ndms/
├── CLAUDE.md                  ← this file
├── docs/
│   └── NDMS_Implementation_Plan.md
├── apps/
│   ├── web/                   Next.js — route groups:
│   │   ├── app/(citizen)/     PWA: SOS, report, shelters, alerts
│   │   ├── app/(govt)/        dashboard: map, queue, dispatch
│   │   ├── app/(rescue)/      mobile-first mission view
│   │   └── app/(facility)/    shelter + hospital portal
│   ├── api/                   NestJS
│   │   ├── src/modules/{health,auth,incidents,missions,facilities,volunteers,alerts,realtime,queue}
│   │   ├── src/infra/{database,redis,storage}   Prisma, ioredis, S3 clients
│   │   ├── src/common/http/   response envelope + exception filter
│   │   └── test/              *.int-spec.ts / *.e2e-spec.ts (Testcontainers)
│   └── worker/                BullMQ consumers
├── packages/
│   ├── shared-types/          generated from the OpenAPI contract
│   └── config/                eslint / tsconfig / tailwind presets
├── infra/
│   ├── docker-compose.yml
│   ├── migrations/            dbmate, forward-only
│   └── verify/                manual EXPLAIN ANALYZE checks
├── data/
│   ├── seed/                  district GeoJSON, villages, facilities
│   └── SOURCES.md             licence + attribution for every dataset
└── tools/
    ├── seed.ts
    └── sensor_sim.py
```

---

## 5. Conventions

- **TypeScript strict mode on.** No `any` without a comment explaining why.
- **API responses are enveloped:** `{ success, data, error, meta }`.
- **Route versioning:** everything under `/api/v1`.
- **Validation with Zod** at the controller boundary, before anything touches a service.
- **Errors:** throw NestJS `HttpException` subclasses; never return error strings.
- **Spatial SQL lives in `*.repository.ts` files**, never inline in a controller.
- **Migrations are forward-only** and checked into `infra/migrations/`.
- **Commits:** conventional commits (`feat:`, `fix:`, `chore:`, `docs:`).
- **Comments explain *why*, not *what*.** The code already says what.
- **No secrets in the repo.** Everything through `.env`, with `.env.example` kept current.

---

## 6. Build order (12 weeks)

Do not jump ahead. Each week depends on the previous one working.

| Week | Deliverable | Done when |
|---|---|---|
| 1 | Repo, Docker Compose, schema v1, spatial indexes | `docker compose up` gives a working stack; `SELECT postgis_version();` works |
| 2 | Auth: OTP, JWT, refresh rotation, `@Roles()` guard | All 5 roles log in and land on the right portal |
| 3 | Incident CRUD, PostGIS geometry, presigned media | A report from Postman persists with valid `location` |
| 4 | Leaflet map, clustering, bbox queries | 1,000 seeded incidents render smoothly |
| 5 | Citizen PWA: SOS button, report form | Full flow works from a real phone browser |
| 6 | Socket.IO gateway, district rooms | New report appears on dashboard with no refresh |
| 7 | Government dashboard: KPIs, queue, filters | Officer can view, filter and sort everything |
| 8 | Missions: nearest-team query, rescue dashboard | Full SOS → assign → accept → complete cycle |
| 9 | Facilities: shelters, occupancy, locator | Shelter finder returns correct nearest-with-space |
| 10 | Volunteers: registration, verification, tasks | Verified volunteer receives a nearby task |
| 11 | Offline: service worker, outbox, sync endpoint | Airplane mode → report → reconnect → appears exactly once |
| 12 | Seed data, load test, measurements, demo | All success criteria in §7 measured and recorded |

**Feature-complete by week 10.** Weeks 11–12 absorb the bugs from weeks 1–10.

---

## 7. Success criteria — measure these, do not estimate

| ID | Criterion | Target |
|---|---|---|
| O1 | SOS to officer dashboard | < 5 s at p95 |
| O2 | Offline sync integrity | 100 % delivered, 0 duplicates |
| O3 | Map render, 5,000 incidents | < 2 s |
| O4 | Nearest-team spatial query | < 100 ms |
| O5 | Concurrent occupancy writes | 0 lost updates |
| O6 | Realtime delivery, 100 clients | ≥ 99 % |
| O7 | Sustained throughput | 50 incidents/s for 5 min |

---

## 8. Explicitly out of scope

Do not build these. If a task seems to need one, stop and ask me.

- Any machine learning (Major phase)
- Kubernetes (Docker Compose is the deployment target)
- Physical IoT hardware (use `tools/sensor_sim.py` over MQTT)
- Payment processing for donations (pledges are records only)
- Native Android/iOS apps (the PWA is the mobile app)
- Multi-district / multi-state deployment (schema partitions on `district_id`, but only one district is loaded)
- Integration with real government systems

---

## 9. Data

All real geography, all free and academically licensed:

| Data | Source | Licence |
|---|---|---|
| District boundaries | DataMeet India Maps | Open |
| Population | WorldPop 100 m gridded | CC-BY |
| Roads | OpenStreetMap / Geofabrik extract | ODbL (attribution required) |
| Terrain | Copernicus DEM GLO-30 | Open |
| Facilities | OSM `amenity=school,community_centre,hospital` | ODbL |
| Weather | Open-Meteo API (no key needed) | Free non-commercial |

**Real locations, declared synthetic attributes.** Shelter registries are not
public, so we take real school/community-hall locations from OSM and generate
capacities from a documented heuristic. Every synthetic value must be marked as
such in `data/SOURCES.md` and in the seed script comments. Never invent
coordinates.

**Seed data must be deterministic** (fixed RNG seed) and spatially realistic —
weight incident placement by population and inverse distance to rivers, not
uniform random. Include one deliberate duplicate cluster (8 reports of one event
within 150 m and 12 minutes) for demo purposes.

**District is not yet chosen.** Ask me before writing any download script.

---

## 10. How I want you to work

- **Read `docs/NDMS_Implementation_Plan.md` for the module you are about to build**
  before writing code. It contains the schema, endpoints and rationale.
- **Ask before scope changes.** Scope creep is the number one risk on this project.
- **Push back if I ask for something that contradicts §3.** Those rules exist
  because the alternative produces a specific bug.
- **Small commits, working state at each one.** No week-long branches.
- **When you finish a module, tell me what to test manually** — not just that it compiles.
- **Flag it if a library version or API has changed** since the plan was written.
- **Do not add dependencies without asking.**

---

## 11. Current status

**Week 1 done (2026-09-13).** `docker compose up` from the repo root gives a healthy
stack (PostGIS, Redis, MinIO, Mosquitto, dbmate migrate, bucket init, API).
`GET /api/v1/health` reports each dependency. Only a database failure returns 503;
Redis or storage down gives 200 `degraded`. `pnpm db:verify-indexes` and
`test/schema.int-spec.ts` show GiST index scans for ST_DWithin, bbox and KNN at 50k rows.

**Schema v1 decisions that differ from the plan's §5.1 DDL:**
- 5 roles, not 8.
- One `facilities` table (`kind` SHELTER/HOSPITAL) instead of `shelters` + `hospitals`.
- `incidents.location` is nullable, so a location-less SOS still lands (A1.2).
- DB-level CHECKs enforce the reported_at clamp (clamp in SQL with `now()`) and require a human actor for rejections.
- No Major-phase tables: pgvector, TimescaleDB, road graph, sensors, simulations.
- Auth tables (refresh tokens) are deferred to the Week 2 migration.

**Known quirks:**
- Nest 12.0.1 needs `setGlobalPrefix('/api/v1')` with the leading slash, or 404s bypass the envelope.
- The prod API image is 442 MB because `@prisma/client`'s optional `prisma` peer drags the CLI in. Trim it during Week 12 deploy hardening.
- Next.js 14 is two majors behind (16.x). Decide before Week 4: react-leaflet 5 needs React 19, so Next 14 means react-leaflet 4.

**Blocked on:** choosing the demonstration district. This decides every dataset
download. Ask me for it before starting `tools/seed.ts` or any data script.

**Next task:** Week 2 — auth: OTP, JWT, refresh rotation, `@Roles()` guard.
