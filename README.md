# NDMS — National Disaster Management System

Multi-agency disaster-response coordination platform for one Indian district: a citizen's
SOS, an officer's map marker, a rescue team's mission and a shelter's intake record are
four role-specific views of **one row**, not four systems.

Four portals (citizen PWA, government control room, rescue, facility) on one NestJS +
PostGIS backend, with Socket.IO for live updates and an offline outbox on the phone.
Demo district: **Darbhanga, Bihar**, with real OpenStreetMap geography.

- **Presenting it:** [`docs/DEMO.md`](docs/DEMO.md) — a ten-minute walkthrough and the demo accounts
- **Numbers:** [`docs/MEASUREMENTS.md`](docs/MEASUREMENTS.md) — every success criterion, measured
- **API:** [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) · **Plan:** [`docs/NDMS_Implementation_Plan.md`](docs/NDMS_Implementation_Plan.md) · **Rules:** [`CLAUDE.md`](CLAUDE.md)

## Prerequisites

- Docker Desktop (Compose v2.20+)
- Node.js 24 LTS (`nvm use 24`) and pnpm 10

## First run

```bash
cp .env.example .env        # COMPOSE_FILE inside lets plain `docker compose` work from the repo root
pnpm install
docker compose up -d --build --wait
curl http://localhost:3000/api/v1/health

node --env-file-if-exists=.env tools/seed.ts --reset --incidents 10000   # Darbhanga demo data
pnpm --filter @ndms/web build
pnpm --filter @ndms/web start     # http://localhost:3001
```

`docker compose up` starts PostGIS, Redis, MinIO, Mosquitto, applies every migration in
`infra/migrations/` (dbmate), creates the media bucket, then starts the API and the worker.

| Service | URL |
|---|---|
| Web (four portals) | http://localhost:3001 |
| API | http://localhost:3000/api/v1 |
| MinIO console | http://localhost:9001 (credentials from `.env`) |
| Postgres | `localhost:5432` |
| Redis | `localhost:6379` |
| MQTT | `localhost:1883` |

### Signing in

There is no SMS gateway in the Minor build: every account accepts the code **`123456`**,
and the login screen says so. The seed creates three accounts per role —
`90000 00001`–`00003` citizen, `00004`–`00006` volunteer, `00007`–`00009` rescue team,
`00010`–`00012` facility manager, `00013`–`00015` government official. Each role lands on
its own portal.

## Developing the API on the host

```bash
pnpm infra:up      # everything except the API container
pnpm api:dev       # watch mode, reads the root .env
```

## Database

Migrations are forward-only SQL in `infra/migrations/`, applied by dbmate. They are the
source of truth; Prisma only mirrors them.

```bash
pnpm db:migrate                         # apply pending migrations
pnpm --filter @ndms/api db:pull         # refresh prisma/schema.prisma from the database
pnpm db:verify-indexes                  # EXPLAIN ANALYZE the spatial queries on 50k throwaway rows
pnpm db:psql
```

Geography columns appear in Prisma as `Unsupported("geography")`: read and write them with
`$queryRaw` inside `*.repository.ts` files.

## Data

The demo district is Darbhanga, Bihar. Every dataset, with its licence, attribution and
checksum, is recorded in [`data/SOURCES.md`](data/SOURCES.md). Raw downloads go in
`data/raw/` (gitignored). Preparation scripts run in the GDAL tools container:

```bash
pnpm data:boundary                                         # data/seed/darbhanga/district.geojson
docker compose run --rm gdal sh tools/data/compare-osm-boundary.sh
```

## Developing the web app

```bash
pnpm --filter @ndms/web dev        # http://localhost:3001, talks to the API on 3000
```

## Tests

```bash
pnpm test                                     # unit
pnpm test:int                                 # integration + e2e against real PostGIS/Redis/MinIO containers (needs Docker)
pnpm --filter @ndms/web test:e2e              # Playwright: the demo walkthrough and the browser criteria
```

Integration tests start their own containers through Testcontainers, so Docker must be
running; they do not touch the development stack. The commands that reproduce every
success criterion are listed at the end of [`docs/DEMO.md`](docs/DEMO.md).
