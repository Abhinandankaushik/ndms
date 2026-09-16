# NDMS demo script

A ten-minute walkthrough that shows every Minor-phase feature in the order that tells the
story: one citizen's SOS becomes an officer's map marker, a rescue team's mission and a
shelter's intake record — four views of one row.

Everything below has been run end to end on the machine it was built on. The measured
results are in [`MEASUREMENTS.md`](MEASUREMENTS.md).

---

## Before the demo (10 minutes, do it once)

```bash
cp .env.example .env
pnpm install
docker compose up -d --build --wait      # PostGIS, Redis, MinIO, Mosquitto, migrations, API, worker
node --env-file-if-exists=.env tools/seed.ts --reset --incidents 10000
pnpm --filter @ndms/web build
pnpm --filter @ndms/web start            # http://localhost:3001
```

The seed loads Darbhanga: 102 villages, 91 shelters and hospitals, 10 rescue teams,
10,000 incidents and 15 demo accounts. It refuses to run against a database that already
holds data unless you pass `--reset`.

Check the stack before you present:

```bash
curl http://localhost:3000/api/v1/health
```

Every dependency should report `up`. A database failure returns 503; Redis or storage
being down returns 200 `degraded`, because the SOS path must keep working without them.

Open two browser windows side by side:

| Window | URL | Sign in as |
|---|---|---|
| Left — the phone | http://localhost:3001 (narrow, or device toolbar → Pixel 7) | `90000 00001` |
| Right — the control room | http://localhost:3001 (full screen) | `90000 00013` |

There is no SMS gateway in the Minor build. Every account signs in with the code
**`123456`**, which the login screen states plainly.

### Demo accounts

Three accounts per role, all synthetic (`data/SOURCES.md`):

| Phone | Role | Lands on |
|---|---|---|
| `90000 00001` – `00003` | Citizen | `/citizen` |
| `90000 00004` – `00006` | Volunteer | `/citizen` (volunteer tab) |
| `90000 00007` – `00009` | Rescue team | `/rescue` |
| `90000 00010` – `00012` | Facility manager | `/facility` |
| `90000 00013` – `00015` | Government official | `/govt` |

---

## The walkthrough

### 1. The problem, in one screen (1 min) — right window

Sign in as the officer. The control room opens on Darbhanga with the seeded picture:
active incidents, people affected, pending reviews, teams available, shelter load.

Say: *every number here is a database query against one district's live data, not a mock.*
The map is viewport-bounded — it loads the incidents in view, not the whole table — and the
legend explains the marker colours. The right-hand panel is the priority queue:
`ORDER BY priority_score DESC, reported_at ASC`. `reported_at` is the *device's* clock, not
the server's, so a report that sat in a phone's outbox for two hours ranks as older and
more urgent, not newer. It is clamped in SQL to the last 24 hours, so a wrong phone clock
cannot jump the queue.

### 2. An SOS, live (2 min) — left window, then right

On the phone, press and hold the SOS button for three seconds. It sends the device
location, the device clock time and a `client_uuid` the phone generated.

Switch to the control room **without refreshing**. A red **New SOS** toast is already up and
a new marker is on the map. That is the Socket.IO district room; measured at **25 ms p95**
against a 5 s target.

Say: the write path is validate → insert → emit → return. Enrichment — duplicate detection
and priority scoring — is queued to the worker afterwards, so the SOS never waits on it.
That is also why the report reaches the map before it has a priority score: a second later
the worker scores it and it takes its place in the queue. Flip the **SOS only** toggle above
the map to pick it out of 10,000 seeded incidents.

### 3. Dispatch (2 min) — right window

Open the new incident from the queue. The drawer has the details, the status timeline and
the actions. Press **Assign**: the dialog lists the available teams nearest the incident,
ordered by ground distance with a GiST-backed KNN query in PostGIS — **27.6 ms p95**,
including HTTP, against a 100 ms target. (Routing around flooded roads is a Major-phase
feature; this is straight-line distance, and the dialog says so.)

Assign the nearest one. The queue row updates in place.

### 4. The rescue team (1 min) — a third window or tab

Sign in as `90000 00007`. The new mission is already there — same event bus, different
room. Walk the steps: **Accept → En route → On site → Complete**. Each step writes to an
append-only status log; a database trigger rejects updates and deletes on that table, so
the audit trail cannot be rewritten.

Back in the control room, the incident's status has moved with it.

### 5. The shelter (1 min) — `90000 00010`

The facility portal shows occupancy against capacity. Press **+1** a few times.

Say: occupancy is never written as an absolute value — the API takes `{ "delta": 12 }` and
the database does `LEAST(occupancy + delta, capacity)`. Two staff members updating at once
therefore cannot overwrite each other. Measured: 50 simultaneous writes, **0 lost updates**.

### 6. Offline, the part that usually breaks (2 min) — left window

In the phone window, open DevTools → Network → **Offline** (or switch the real phone to
airplane mode).

Send another SOS. The app says it is saved on the phone; the service worker holds it in an
IndexedDB outbox.

Turn the network back on. The outbox flushes, and the report appears in the control room —
**exactly once**. The `client_uuid` has a unique constraint and the insert is an
`ON CONFLICT (client_uuid) DO UPDATE`, so a retry can never create a second incident.
Show *My reports* on the phone: one entry, not two.

### 7. What is deliberately not automatic (1 min) — right window

Open **Reviews**. Reports the checks flagged — possible duplicates, reports without a
location — wait here with their status unchanged. Nothing is ever auto-rejected; a person
decides, and the rejection is recorded with the actor who made it (the database enforces
that too).

Close with **Resources** and **Alerts**: shelters and hospitals with live occupancy, and
the alert broadcast to a district.

---

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| "Too many requests" on the OTP screen | 30 verifications per 15 min per IP | Wait, or `docker compose exec redis redis-cli --scan --pattern 'ratelimit:*'` and delete the key |
| "Too many OTP requests" | Per-phone send limit | Use the next demo phone (`…00002`), or delete `otp:sends:<phone>` in Redis |
| The map is empty | The seed has not been run | `node --env-file-if-exists=.env tools/seed.ts --reset --incidents 10000` |
| The dashboard shows stale numbers | Socket disconnected | The header shows a Live / Reconnecting badge; reload |
| A portal 404s | Wrong role for that phone | Check the account table above |

## Rebuilding the demo data

The seed is deterministic — a fixed RNG seed, so every run produces the same district,
the same incidents and the same deliberate duplicate cluster (8 reports of one event within
150 m and 12 minutes, which is what the review queue is showing). It prints an incident
fingerprint you can compare between runs.

```bash
node --env-file-if-exists=.env tools/seed.ts --reset --incidents 10000
```

Run this after the load test below, which writes 15,000 real incidents of its own.

## Reproducing the measurements

```bash
node apps/api/scripts/criteria.mjs                          # O1, O4, O5
node apps/api/scripts/realtime-fanout.mjs                    # O6: 100 socket clients
pnpm --filter @ndms/web test:e2e e2e/criteria.spec.ts        # O2 offline, O3 map
docker run --rm -i grafana/k6 run - < tools/load/sos-throughput.js   # O7: 50/s for 5 min
pnpm --filter @ndms/web test:e2e e2e/demo.spec.ts            # screenshots of every portal
```
