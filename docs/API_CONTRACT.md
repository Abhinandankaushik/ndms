# NDMS Minor — API & realtime contract

The single source of truth that backend and frontend work is built against. Implemented
endpoints are marked **(built)**; everything else is the agreed shape to implement.
All HTTP paths are under `/api/v1`. All responses use the envelope
`{ success, data, error: { code, message, details? } | null, meta: null }`.

Conventions every module follows:

- **Auth.** `Authorization: Bearer <accessToken>`. Every route is authenticated unless it
  says **public**. Roles: `CITIZEN`, `VOLUNTEER`, `RESCUE_TEAM`, `FACILITY_MANAGER`,
  `GOVT_OFFICIAL`. The JWT carries `role`, `districtId`, `rescueTeamId` and `facilityId`.
- **District scoping.** Officials, rescue teams and facility managers only see and act on
  rows in their own `districtId`. Out-of-scope ids return **404**, not 403.
- **Errors.** Throw Nest `HttpException`s with a body of `{ code, message, details? }`.
  Codes are `SCREAMING_SNAKE`. Validation failures return 400 `VALIDATION_FAILED`, via
  `zodBody(schema)` / `zodQuery(schema)` / `uuidParam`.
- **Coordinates.** Always `lat` and `lon` (never `lng`), in WGS 84 decimal degrees.
  Distances are in metres (`distanceM`).
- **Timestamps.** ISO 8601 strings in UTC.
- **Writes from devices** carry a client-generated `clientUuid` and are idempotent.
- **Counters** (occupancy, stock) change only by `delta` (CLAUDE.md rule 4).
- **Map lists** require `bbox=minLon,minLat,maxLon,maxLat` (CLAUDE.md rule 9).

## Realtime (Socket.IO) (built)

Connect to the API origin with `io(API_ORIGIN, { auth: (cb) => cb({ token: accessToken }) })`.
Rooms are joined automatically from the token:

| Room | Who |
|---|---|
| `user:{userId}` | every user |
| `role:{ROLE}` | every user of that role |
| `district:{districtId}` | `GOVT_OFFICIAL` |
| `team:{rescueTeamId}` | `RESCUE_TEAM` users with a team |
| `facility:{facilityId}` | `FACILITY_MANAGER` users with a facility |
| `incident:{incidentId}` | after emitting `incident:subscribe { incidentId }` (ack `{ ok }`); the reporter or an in-district official/rescue team |

Server code emits by publishing `{ name, rooms, payload }` on `DomainEventBus`. Other
processes (the worker) publish the same JSON on the Redis channel `ndms:events`.

| Event | Rooms | Payload |
|---|---|---|
| `incident:created` (built) | district | `{ id, districtId, reporterId, type, status, isSos, lat, lon, accuracyM, locationSource, peopleAffected, hasElderly, hasChildren, hasInjured, priorityScore, reportedAt }` |
| `incident:updated` (built) | district, incident | full incident record |
| `incident:status_changed` (built) | district, incident, reporter's user room | `{ id, from, to, by, at }` |
| `incident:media_added` (built) | district, incident | `{ incidentId, mediaId, contentType }` |
| `incident:enriched` | district, incident | `{ id, priorityScore, severityLevel, flags: ReviewReason[] }` |
| `review:created` / `review:resolved` (built) | district | review record |
| `mission:assigned` | team, district, incident | `{ mission, incident }` |
| `mission:status_changed` | team, district, incident | `{ missionId, incidentId, teamId, from, to, at }` |
| `team:location` | district, plus `incident:{id}` for the active mission | `{ teamId, missionId, lat, lon, accuracyM, recordedAt }` |
| `facility:capacity_changed` | district, facility | `{ facilityId, occupancy, capacity, utilisation }` |
| `facility:capacity_alert` | district, facility | `{ facilityId, name, occupancy, capacity, utilisation }`, emitted when utilisation first reaches 85 % |
| `facility:inventory_changed` | district, facility | `{ facilityId, item, quantity, lowStockThreshold, isLow }` |
| `alert:broadcast` | `role:{R}` for each target role (all roles if none) | `{ id, severity, title, message, geofence, issuedAt, expiresAt }` (geofence is GeoJSON or null); clients filter by their own position |
| `alert:cancelled` | same as broadcast | `{ id }` |
| `volunteer:reviewed` | user | `{ userId, verificationStatus, rejectionReason }` |
| `volunteer_task:created` | `role:VOLUNTEER`, district | task record |
| `volunteer_task:updated` | district, assigned volunteer's user room | task record |

## Auth (built)

| Method & path | Access | Body / query | Returns |
|---|---|---|---|
| `POST /auth/otp/send` | public | `{ phone }` (E.164) | `{ expiresInSeconds }` |
| `POST /auth/otp/verify` | public | `{ phone, code }` | `{ accessToken, tokenType, expiresInSeconds, user }` and sets the httpOnly `ndms_refresh` cookie (path `/api/v1/auth`) |
| `POST /auth/refresh` | public (cookie) | — | same as verify; rotates the cookie. Replaying an old token revokes the session (`REFRESH_REUSED`) |
| `POST /auth/logout` | public (cookie) | — | `{ loggedOut: true }` |
| `GET /auth/me` | any | — | `user` = `{ id, phone, fullName, role, districtId, rescueTeamId, facilityId }` |
| `PATCH /auth/me` | any | `{ fullName }` | `user` |

Dev and demo builds accept `OTP_DEV_CODE` (`123456`) for every phone. New phones register
as `CITIZEN`.

## Incidents (built)

| Method & path | Access | Body / query | Returns |
|---|---|---|---|
| `POST /incidents/sos` | any | `{ clientUuid, lat?, lon?, accuracyM?, reportedAt, type? = OTHER, peopleAffected? = 1 }` | 201 new / 200 replay: `{ id, districtId, status, reportedAt, wasInserted }`; 409 `CLIENT_UUID_CONFLICT` |
| `POST /incidents` | any | `{ clientUuid, lat?, lon?, accuracyM?, locationSource? (GPS\|MANUAL_PIN), reportedAt, type, description?, addressText?, peopleAffected?, hasElderly?, hasChildren?, hasInjured? }` | same as SOS |
| `GET /incidents?bbox=&status=&type=&limit=` | GOVT_OFFICIAL, RESCUE_TEAM | status/type are CSV; defaults to open statuses | `MapMarker[]` = `{ id, type, status, isSos, lat, lon, accuracyM, priorityScore, peopleAffected, reportedAt }` |
| `GET /incidents/queue?status=&type=&sosOnly=&limit=&offset=` | GOVT_OFFICIAL, RESCUE_TEAM | — | `Incident[]` sorted by `priorityScore DESC NULLS LAST, reportedAt ASC` |
| `GET /incidents/mine` | any | — | `Incident[]` newest first |
| `GET /incidents/:id` | reporter, in-district responder | — | `Incident & { timeline: { fromStatus, toStatus, changedBy, note, changedAt }[] }` |
| `PATCH /incidents/:id` | reporter, in-district official | `{ type?, description?, addressText?, peopleAffected?, hasElderly?, hasChildren?, hasInjured?, manualPin?: { lat, lon } }` | `Incident` |
| `PATCH /incidents/:id/status` | GOVT_OFFICIAL, RESCUE_TEAM | `{ status, note?, duplicateOf? }` | `Incident`; 409 `INVALID_TRANSITION` |
| `POST /incidents/:id/flags` | GOVT_OFFICIAL | `{ reason, relatedIncidentId?, note? }` | review; 409 `REVIEW_ALREADY_PENDING` |
| `GET /reviews?limit=` | GOVT_OFFICIAL | — | pending reviews with an `incident` summary |
| `POST /reviews/:id/resolve` | GOVT_OFFICIAL | `{ resolutionNote, incidentStatus? (VERIFIED\|RESOLVED\|REJECTED_DUPLICATE\|REJECTED_FAKE), duplicateOf? }` | review |
| `POST /media/presign` | reporter, in-district responder | `{ incidentId, contentType (image/jpeg\|png\|webp), sizeBytes ≤ 10 MB }` | `{ mediaId, objectKey, uploadUrl, method: 'PUT', headers, expiresInSeconds }`; the browser PUTs the file to `uploadUrl` with `headers` |
| `POST /media/confirm` | uploader | `{ mediaId }` | media record; 409 `MEDIA_NOT_UPLOADED`, 422 `MEDIA_REJECTED` |
| `GET /incidents/:id/media` | reporter, in-district responder | — | `{ id, contentType, sizeBytes, confirmedAt, url, expiresInSeconds }[]` |

`Incident` = `{ id, clientUuid, districtId, reporterId, type, status, isSos, lat, lon,
locationSource, accuracyM, addressText, description, peopleAffected, hasElderly,
hasChildren, hasInjured, priorityScore, severityLevel, duplicateOf, reportedAt, createdAt,
updatedAt, resolvedAt }`.

Status workflow: officials can move `REPORTED → VERIFIED | ASSIGNED | RESOLVED |
REJECTED_*`, `VERIFIED → ASSIGNED | RESOLVED | REJECTED_*`, `ASSIGNED → IN_PROGRESS |
VERIFIED | RESOLVED`, `IN_PROGRESS → ASSIGNED | RESOLVED`, and `RESOLVED | REJECTED_* →
REPORTED`. Rescue teams can only move `ASSIGNED → IN_PROGRESS → RESOLVED`. Missions use
`IncidentsService.applyMissionTransition` (built).

The SOS enqueues BullMQ job `enrich` on queue `incident-enrichment` with
`{ incidentId }` and `jobId = incidentId`, fire-and-forget (built).

## Missions & teams (Week 8)

| Method & path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /teams` | GOVT_OFFICIAL | — | `Team[]` = `{ id, name, agency, teamSize, capabilities, isAvailable, lat, lon, locationUpdatedAt, activeMissionId }`, with live Redis positions overlaid |
| `GET /teams/nearest?incidentId=&capability=&limit=5` | GOVT_OFFICIAL | — | `(Team & { distanceM })[]`: available teams by KNN (`current_location <-> point`), within the district. O4 target < 100 ms |
| `POST /missions` | GOVT_OFFICIAL | `{ incidentId, teamId, etaMinutes? }` | `Mission`; 409 `MISSION_ALREADY_OPEN`, 409 `TEAM_UNAVAILABLE`; moves the incident to ASSIGNED |
| `GET /missions?status=&incidentId=` | GOVT_OFFICIAL | — | `Mission[]` |
| `GET /missions/mine` | RESCUE_TEAM | — | `MissionWithIncident[]`: open first, by incident priority |
| `GET /missions/:id` | in-district official, the assigned team | — | `MissionWithIncident`, including the reporter's name and phone for the team, and an `AuditService.record` row `mission.reporter_contact.viewed` |
| `PATCH /missions/:id/status` | team (forward steps), official (CANCELLED) | `{ status, rejectionReason?, peopleRescued?, injuredCount?, hospitalRequired?, outcomeNotes? }` | `Mission` |
| `POST /teams/me/location` | RESCUE_TEAM | `{ lat, lon, accuracyM?, recordedAt }` | 202 `{ accepted: boolean }`; writes to Redis only |

Mission steps are `ASSIGNED → ACCEPTED | REJECTED` (a rejection needs a reason),
`ACCEPTED → EN_ROUTE → ON_SITE → COMPLETED` (completion needs `peopleRescued`), and any
open step `→ CANCELLED` (officials only). Side effects:

| Step | Team | Incident |
|---|---|---|
| ACCEPTED | `is_available = false` | — |
| EN_ROUTE | — | → IN_PROGRESS |
| COMPLETED | available again | → RESOLVED |
| REJECTED / CANCELLED | available again | → VERIFIED, if no other mission is open |

`Mission` = `{ id, incidentId, teamId, assignedBy, status, etaMinutes, rejectionReason,
peopleRescued, injuredCount, hospitalRequired, outcomeNotes, assignedAt, acceptedAt,
reachedAt, completedAt, updatedAt }`.

Live location (CLAUDE.md rule 6):

- **Storage.** Accepted pings go to Redis only: `SET team:loc:{teamId}` (JSON, 10-minute
  TTL) plus `RPUSH team:pings:buffer`.
- **Throttle.** The server drops pings under 5 s or 20 m from the previous one; the
  client throttles to 10 s.
- **Flush.** Every 30 s, a flusher inside the missions module drains the buffer in one
  multi-row INSERT into `team_location_pings` and updates `rescue_teams.current_location`.
  A Redis `SET NX` lock makes it single-runner. Tests call the flush directly.

## Facilities (Week 9)

| Method & path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /facilities/nearby?lat=&lon=&kind=SHELTER&withSpaceOnly=true&limit=10` | any | — | `(Facility & { distanceM })[]` by KNN |
| `GET /facilities?bbox=&kind=` | GOVT_OFFICIAL, RESCUE_TEAM | — | `Facility[]` |
| `GET /facilities/mine` | FACILITY_MANAGER | — | `FacilityDetail` |
| `GET /facilities/:id` | any | — | `FacilityDetail` = `Facility & { inventory: InventoryLine[] }` |
| `POST /facilities` | GOVT_OFFICIAL | `{ kind, name, lat, lon, address?, contactPhone?, capacity, amenities?, attributes? }` | `Facility`; the district comes from the point |
| `PATCH /facilities/:id` | GOVT_OFFICIAL, its FACILITY_MANAGER | `{ name?, capacity?, isOperational?, address?, contactPhone?, amenities?, attributes? }` | `Facility`; 409 `CAPACITY_BELOW_OCCUPANCY` |
| `PATCH /facilities/:id/occupancy` | GOVT_OFFICIAL, its FACILITY_MANAGER | `{ delta }` (non-zero integer, \|delta\| ≤ 10 000) | `{ occupancy, capacity, freeCapacity, utilisation }`, clamped to `[0, capacity]` in SQL. O5: 0 lost updates |
| `PATCH /facilities/:id/inventory/:item` | GOVT_OFFICIAL, its FACILITY_MANAGER | `{ delta?, lowStockThreshold? }` | `InventoryLine`; quantity clamped at ≥ 0 |

`Facility` = `{ id, districtId, kind, name, lat, lon, address, contactPhone, capacity,
occupancy, freeCapacity, utilisation, isOperational, amenities, attributes, updatedAt }`.
`InventoryLine` = `{ item, quantity, lowStockThreshold, isLow, updatedAt }`.

## Volunteers (Week 10)

| Method & path | Access | Body / query | Returns |
|---|---|---|---|
| `POST /volunteers/register` | CITIZEN, VOLUNTEER | `{ skills: string[], serviceRadiusKm, lat, lon }` | `VolunteerProfile` (PENDING); updates `users.last_location` |
| `GET /volunteers/me` | any | — | `VolunteerProfile`, or 404 |
| `PATCH /volunteers/me` | registered | `{ skills?, serviceRadiusKm?, isAvailable?, lat?, lon? }` | `VolunteerProfile` |
| `POST /volunteers/me/documents/presign` | registered | `{ contentType (image/jpeg\|png\|webp\|application/pdf), sizeBytes }` | same shape as `/media/presign`; media purpose `VOLUNTEER_DOCUMENT` |
| `POST /volunteers/me/documents/confirm` | registered | `{ mediaId }` | media record |
| `GET /volunteers?status=PENDING` | GOVT_OFFICIAL | — | `(VolunteerProfile & { phone, fullName, documents: { id, url }[] })[]`, recorded with `AuditService` |
| `POST /volunteers/:userId/review` | GOVT_OFFICIAL | `{ decision: VERIFIED\|REJECTED, rejectionReason? }` | `VolunteerProfile`; VERIFIED sets `users.role = VOLUNTEER` and `district_id` from the location |
| `POST /volunteer-tasks` | GOVT_OFFICIAL, FACILITY_MANAGER | `{ title, description?, requiredSkills?, lat, lon, incidentId?, facilityId? }` | `VolunteerTask` |
| `GET /volunteer-tasks?status=` | GOVT_OFFICIAL | — | `VolunteerTask[]` |
| `GET /volunteer-tasks/nearby` | verified VOLUNTEER | — | `(VolunteerTask & { distanceM })[]`: OPEN tasks within the service radius whose required skills overlap (`&&`) or are empty |
| `GET /volunteer-tasks/mine` | VOLUNTEER | — | `VolunteerTask[]` |
| `POST /volunteer-tasks/:id/accept` | verified VOLUNTEER | — | `VolunteerTask`; atomic, 409 `TASK_TAKEN` |
| `POST /volunteer-tasks/:id/complete` | assigned volunteer | — | `VolunteerTask` |
| `POST /volunteer-tasks/:id/cancel` | creator, GOVT_OFFICIAL | — | `VolunteerTask` |

## Alerts (C7, G7)

| Method & path | Access | Body / query | Returns |
|---|---|---|---|
| `POST /alerts` | GOVT_OFFICIAL | `{ severity, title, message, targetRoles?: Role[], geofence?: GeoJSON Polygon\|MultiPolygon, expiresAt? }` | `Alert`; the geofence must intersect the official's district |
| `GET /alerts` | GOVT_OFFICIAL | — | district history, newest first |
| `GET /alerts/active?lat=&lon=` | any | — | active alerts for the caller's role whose geofence covers the point, or has no geofence |
| `POST /alerts/:id/cancel` | GOVT_OFFICIAL | — | `Alert` |

`Alert` = `{ id, districtId, severity, title, message, targetRoles, geofence (GeoJSON|null),
issuedAt, expiresAt, cancelledAt }`.

## Dashboard (G3, G4, G8)

| Method & path | Access | Returns |
|---|---|---|
| `GET /districts/mine` | any with a district, else the first district | `{ id, name, state, bbox: [minLon,minLat,maxLon,maxLat], centroid: { lat, lon }, boundary: GeoJSON }` |
| `GET /dashboard/summary` | GOVT_OFFICIAL | `{ activeIncidents, openSos, peopleAffected, pendingReviews, teamsTotal, teamsAvailable, teamsOnMission, shelterCapacity, shelterOccupancy, shelterUtilisation, peopleRescuedToday, avgResponseMinutes24h, verifiedVolunteers, generatedAt }` |
| `GET /dashboard/heatmap?bbox=&hours=24&cellDegrees=0.01` | GOVT_OFFICIAL | `{ lat, lon, count, avgPriority }[]` from `ST_SnapToGrid` over open incidents in the window. This replaces a district choropleth, because one district has no sub-district polygons |
| `GET /dashboard/resources` | GOVT_OFFICIAL | `{ facilityId, name, kind, capacity, occupancy, utilisation, lowStock: InventoryLine[] }[]`, most utilised first |

## Platform

- **Rate limiting (P5).** Redis sliding window via `@RateLimit({ bucket, limit, windowSeconds })`
  and a global guard; responds 429 `RATE_LIMITED`. `POST /incidents` allows 10 per hour
  per user; `POST /auth/otp/verify` allows 10 per 15 minutes per IP. **`POST /incidents/sos`
  is never limited.** If Redis is unavailable the guard fails open.
- **Audit (P6)** (built). `AuditService.record({ actorId, action, entityType, entityId,
  metadata?, ipAddress? })`. Action names are `entity.field.verb`, e.g.
  `mission.reporter_contact.viewed`. `GET /audit?entityType=&entityId=&limit=` is for
  GOVT_OFFICIAL.
- **Offline sync (C8).** `POST /incidents/sync`, any user, body
  `{ items: ({ kind: 'SOS', body: SosBody } | { kind: 'REPORT', body: ReportBody })[] }`
  (1–50 items). Returns `{ results: { clientUuid, outcome: 'CREATED'|'DUPLICATE'|'CONFLICT'|'INVALID', id?, error? }[] }`
  in request order. Each item goes through `IncidentsService` separately, so one bad item
  never fails the batch.

## Worker (`apps/worker`)

- **Enrichment.** Consumes queue `incident-enrichment` with concurrency 5, then:
  1. Computes a rule-based `priority_score` (0–100) and `severity_level` (1–5) from type,
     people affected, vulnerability flags, SOS, and minutes waiting. The weights are
     documented in code.
  2. Flags `LOCATION_UNCERTAIN` when the location is NONE.
  3. Flags `POSSIBLE_DUPLICATE` when another open incident of the same type lies within
     150 m and 15 minutes (`related_incident_id` set).
  4. Inserts flags into `incident_reviews` with `flagged_by NULL` and
     `ON CONFLICT DO NOTHING`.
  5. Publishes `incident:enriched`, plus `review:created` per new flag, on `ndms:events`.
- **Rule 8.** The worker never changes an incident's status.
- **Sweep.** Every 60 s, re-enqueues open incidents older than 1 minute with
  `priority_score IS NULL`.

## Web app (`apps/web`)

- **Stack.** Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui.
- **REST.** `/api/v1/*` is rewritten to `API_ORIGIN`, so the refresh cookie is
  first-party. Socket.IO connects directly to `NEXT_PUBLIC_API_ORIGIN`.
- **Session.** The access token lives in memory (zustand). On load, call
  `POST /api/v1/auth/refresh`. On a 401, refresh once, single-flighted with
  `navigator.locks.request('ndms-refresh')`, then retry.
- **Portals.** Role picks the landing route: CITIZEN and VOLUNTEER go to `/citizen`,
  GOVT_OFFICIAL to `/govt`, RESCUE_TEAM to `/rescue`, FACILITY_MANAGER to `/facility`.
  Route groups are `(auth)`, `(citizen)`, `(govt)`, `(rescue)` and `(facility)`.
- **Tiles.** Map tiles come from `tile.openstreetmap.org` with "© OpenStreetMap
  contributors" visible. Do not bulk-download tiles; the OSM tile policy forbids it.
  Offline caching covers tiles the user has already viewed.
- **Secure context.** Geolocation and service workers need one: `localhost`, or HTTPS
  for phones.
