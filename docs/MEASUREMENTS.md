# Success criteria — measured results

Every figure here was measured, not estimated, on the seeded Darbhanga district with the
full stack running. Each row names the script that produced it, so it can be re-run.

**Machine:** Intel Core i5-10300H (4 cores / 8 threads), 15.8 GB RAM, Windows 11,
Docker Desktop 28.0.4. The API, worker, PostGIS, Redis, MinIO and Mosquitto all run in
containers on this one laptop; the web app runs on the host with `next start`.

**Data:** the deterministic seed (`node tools/seed.ts --reset --incidents 10000`) —
10,000 incidents, 19,063 status-log entries, 102 villages, 91 facilities (40 shelters,
51 hospitals), 10 rescue teams and 6,025 users on the DataMeet district boundary, with
facilities and settlements from OpenStreetMap. Incident fingerprint `3736b05446ca9437162cdfb199e3fe00`, so the same seed
reproduces the same district. **Date:** 2026-09-17.

| ID | Criterion | Target | Measured | Verdict |
|---|---|---|---|---|
| O1 | SOS to officer dashboard | < 5 s at p95 | **25 ms p95** (median 10 ms, max 63 ms, 30/30 events) | ✅ |
| O2 | Offline sync integrity | 100 % delivered, 0 duplicates | **1 of 1 delivered, 0 duplicates** | ✅ |
| O3 | Map render, 5,000 incidents | < 2 s | **1,550 ms** with "5,000 incidents in view" | ✅ |
| O4 | Nearest-team spatial query | < 100 ms | **27.6 ms p95** (median 15.5 ms, 50 calls, HTTP included) | ✅ |
| O5 | Concurrent occupancy writes | 0 lost updates | **0 lost** across 50 simultaneous writes | ✅ |
| O6 | Realtime delivery, 100 clients | ≥ 99 % | **100.00 %** (2,000 of 2,000 deliveries) | ✅ |
| O7 | Sustained throughput | 50 incidents/s for 5 min | **15,001 reports at 50.22/s, 0 failed**, p95 20.7 ms | ✅ |

---

## O1 — an SOS reaches the officer's dashboard

`node apps/api/scripts/criteria.mjs`

An officer socket joins the district room, then 30 SOS reports are posted in sequence. The
clock starts immediately before each POST and stops when the `incident:created` event
arrives at the officer's client, so it covers validation, the insert, the district
resolution and the socket fan-out.

```
O1  SOS on the officer dashboard: p95 25 ms, median 10 ms, max 63 ms over 30/30 events
```

The same journey measured through the browser — a citizen holding the SOS button until the
officer's dashboard reacts, with no refresh — took **31 ms**
(`apps/web/e2e/demo.spec.ts`). Both are far inside the 5 s target because the SOS path
does not block: enrichment is queued to the worker after the response is sent.

## O2 — a report made offline arrives exactly once

`pnpm --filter @ndms/web test:e2e e2e/criteria.spec.ts` (Pixel 7 profile)

The test signs in as a citizen, puts the browser context offline, sends an SOS, and
confirms the API has received nothing. It then reconnects and polls until the report
appears, and keeps watching for a further five seconds.

```
O2: the offline report arrived once as 43dbd4df-b06a-45c6-80d0-9a0af4d46f74,
    with no duplicate after a further 5 s
```

The guarantee is structural, not timing luck: the phone generates `client_uuid`, the column
is `UNIQUE`, and the insert is `ON CONFLICT (client_uuid) DO UPDATE`, so however often the
outbox retries, there is one row.

## O3 — the officer map at scale

Same Playwright run, desktop profile. The clock starts at a full page reload and stops when
the map reports its loaded incidents.

```
O3: officer map ready in 1550 ms showing "5,000 incidents in view" (target < 2000 ms)
```

5,000 is the API's per-viewport cap; the map says so and asks the officer to zoom in for
more. Queries are bounding-box filtered (`location && ST_MakeEnvelope(...)`), so the index
does the work rather than a sequential scan.

## O4 — the nearest available team

`node apps/api/scripts/criteria.mjs`

50 calls to `GET /api/v1/teams/nearest`, timed from the client, so HTTP, JWT verification,
the guard and the envelope are all inside the number.

```
O4  nearest-team query: p95 27.6 ms, median 15.5 ms over 50 calls including HTTP
```

## O5 — two people updating one shelter at once

`node apps/api/scripts/criteria.mjs`

50 concurrent `PATCH /facilities/:id/occupancy { "delta": 1 }`, then 50 more with `-1` to
put the demo data back.

```
O5  concurrent occupancy writes: 50 simultaneous +1 took 247 -> 297 (0 lost updates),
    then 50 x -1 restored it to 247
```

Occupancy is only ever written as a delta inside one SQL statement
(`LEAST(occupancy + $2, capacity)`), so there is no read-modify-write window to lose.

## O6 — 100 dashboards watching at once

`node apps/api/scripts/realtime-fanout.mjs`

100 Socket.IO clients join the district room, then 20 incidents are published.

```
100 dashboard clients connected
O6: 2000/2000 events delivered (100.00 %), 0 clients short, 20 events published in 3553 ms
```

## O7 — sustained throughput

`docker run --rm -i grafana/k6 run - < tools/load/sos-throughput.js`

k6 holds a constant arrival rate of 50 SOS per second for five minutes — 15,000 reports —
with thresholds of under 1 % failed requests and a p95 server latency under 300 ms. Those
15,000 reports are real rows, so the demo database is reset afterwards:
`node tools/seed.ts --reset --incidents 10000`.

```
checks_succeeded...: 100.00% 15001 out of 15001
checks_failed......: 0.00%   0 out of 15001
sos_latency_ms.....: avg=10.3ms  med=6.9ms  p(90)=19.17ms  p(95)=20.67ms  max=130.66ms
http_req_failed....: 0.00%   0 out of 15007
http_reqs..........: 15007   50.240894/s
iterations.........: 15001   50.220807/s
```

Both thresholds passed. The arrival rate never dropped below 50/s and no iteration was
dropped, so the API absorbed the full load rather than shedding it — p95 stayed at 20.7 ms,
an order of magnitude inside the 300 ms budget, on a four-core laptop also running
PostGIS, Redis, MinIO and the worker.

An earlier run of the same script against a database already holding 15,000 load-test rows
gave p95 35 ms with the same 0 % failure rate, so the cost of the larger table shows up in
latency and not in dropped reports.

