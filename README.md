# NDMS — National Disaster Management System

Multi-agency disaster-response coordination platform. Design and build plan:
[`docs/NDMS_Implementation_Plan.md`](docs/NDMS_Implementation_Plan.md). Working rules: [`CLAUDE.md`](CLAUDE.md).

## Prerequisites

- Docker Desktop (Compose v2.20+)
- Node.js 24 LTS (`nvm use 24`) and pnpm 10

## First run

```bash
cp .env.example .env        # COMPOSE_FILE inside lets plain `docker compose` work from the repo root
pnpm install
docker compose up -d --build --wait
curl http://localhost:3000/api/v1/health
```

`docker compose up` starts PostGIS, Redis, MinIO, Mosquitto, applies every migration in
`infra/migrations/` (dbmate), creates the media bucket, then starts the API.

| Service | URL |
|---|---|
| API | http://localhost:3000/api/v1 |
| MinIO console | http://localhost:9001 (credentials from `.env`) |
| Postgres | `localhost:5432` |
| Redis | `localhost:6379` |
| MQTT | `localhost:1883` |

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

## Tests

```bash
pnpm test          # unit
pnpm test:int      # integration + e2e against real PostGIS/Redis/MinIO containers (needs Docker)
```
