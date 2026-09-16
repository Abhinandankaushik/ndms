// Measures the success criteria that need the running stack rather than a browser:
// O1 (SOS to officer dashboard), O4 (nearest-team query) and O5 (concurrent occupancy
// writes). Run with the stack up:  node apps/api/scripts/criteria.mjs
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.NDMS_API_ORIGIN ?? 'http://localhost:3000';
const OTP = process.env.OTP_DEV_CODE ?? '123456';
const OFFICIAL = '+919000000013';
const CITIZEN = '+919000000001';
const SOS_SAMPLES = Number(process.env.SOS_SAMPLES ?? 30);
const QUERY_SAMPLES = Number(process.env.QUERY_SAMPLES ?? 50);
const CONCURRENT_WRITES = Number(process.env.CONCURRENT_WRITES ?? 50);

const call = async (method, path, { body, token } = {}) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const envelope = await response.json();
  if (!envelope.success) throw new Error(`${method} ${path} -> ${JSON.stringify(envelope.error)}`);
  return envelope.data;
};

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

async function signIn(phone) {
  await call('POST', '/api/v1/auth/otp/send', { body: { phone } });
  const session = await call('POST', '/api/v1/auth/otp/verify', { body: { phone, code: OTP } });
  return session.accessToken;
}

const officialToken = await signIn(OFFICIAL);
const citizenToken = await signIn(CITIZEN);

// O1 --------------------------------------------------------------------------------
// incident:created carries no clientUuid, and the event regularly beats the HTTP response
// back. The SOS calls below are sequential, so the events are in send order: match FIFO.
const pending = [];
const latencies = [];
const socket = io(API, { transports: ['websocket'], auth: { token: officialToken }, reconnection: false });
await new Promise((resolve, reject) => {
  socket.once('connect', resolve);
  socket.once('connect_error', reject);
});
socket.on('incident:created', () => {
  const startedAt = pending.shift();
  if (startedAt !== undefined) latencies.push(Date.now() - startedAt);
});

for (let n = 0; n < SOS_SAMPLES; n += 1) {
  pending.push(Date.now());
  await call('POST', '/api/v1/incidents/sos', {
    token: citizenToken,
    body: {
      clientUuid: randomUUID(),
      lat: 26.1 + Math.random() * 0.25,
      lon: 85.8 + Math.random() * 0.35,
      accuracyM: 18,
      reportedAt: new Date().toISOString(),
      type: 'FLOOD',
      peopleAffected: 3,
    },
  });
}
await new Promise((resolve) => setTimeout(resolve, 2_000));
socket.disconnect();
console.log(
  `O1  SOS on the officer dashboard: p95 ${percentile(latencies, 95)} ms, median ${percentile(latencies, 50)} ms, ` +
    `max ${Math.max(...latencies)} ms over ${latencies.length}/${SOS_SAMPLES} events (target < 5000 ms)`,
);

// O4 --------------------------------------------------------------------------------
const queue = await call('GET', '/api/v1/incidents/queue?limit=5', { token: officialToken });
const incidentId = queue[0].id;
const queryTimes = [];
for (let n = 0; n < QUERY_SAMPLES; n += 1) {
  const startedAt = performance.now();
  await call('GET', `/api/v1/teams/nearest?incidentId=${incidentId}&limit=5`, { token: officialToken });
  queryTimes.push(performance.now() - startedAt);
}
console.log(
  `O4  nearest-team query: p95 ${percentile(queryTimes, 95).toFixed(1)} ms, median ${percentile(queryTimes, 50).toFixed(1)} ms ` +
    `over ${QUERY_SAMPLES} calls including HTTP (target < 100 ms)`,
);

// O5 --------------------------------------------------------------------------------
const nearby = await call(
  'GET',
  '/api/v1/facilities/nearby?lat=26.1542&lon=85.8918&kind=SHELTER&limit=20',
  { token: officialToken },
);
const target = nearby.find((facility) => facility.capacity - facility.occupancy > CONCURRENT_WRITES + 5);
if (!target) throw new Error('no shelter has enough headroom for the concurrency test');

const before = target.occupancy;
const patch = (delta) => call('PATCH', `/api/v1/facilities/${target.id}/occupancy`, { token: officialToken, body: { delta } });
await Promise.all(Array.from({ length: CONCURRENT_WRITES }, () => patch(1)));
const raised = (await call('GET', `/api/v1/facilities/${target.id}`, { token: officialToken })).occupancy;
await Promise.all(Array.from({ length: CONCURRENT_WRITES }, () => patch(-1)));
const restored = (await call('GET', `/api/v1/facilities/${target.id}`, { token: officialToken })).occupancy;

const lost = before + CONCURRENT_WRITES - raised;
console.log(
  `O5  concurrent occupancy writes: ${CONCURRENT_WRITES} simultaneous +1 on "${target.name}" took ${before} -> ${raised} ` +
    `(${lost} lost updates), then ${CONCURRENT_WRITES} x -1 restored it to ${restored}`,
);

// exitCode rather than exit(): a hard exit while socket.io is still tearing its handles
// down trips a libuv assertion on Windows.
process.exitCode = percentile(latencies, 95) < 5_000 && percentile(queryTimes, 95) < 100 && lost === 0 ? 0 : 1;
