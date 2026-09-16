// Criterion O6: with 100 dashboard clients connected, at least 99 % of incident events
// reach every one of them. Run with the stack up:
//   node apps/api/scripts/realtime-fanout.mjs
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.NDMS_API_ORIGIN ?? 'http://localhost:3000';
const OTP = process.env.OTP_DEV_CODE ?? '123456';
const CLIENTS = Number(process.env.CLIENTS ?? 100);
const EVENTS = Number(process.env.EVENTS ?? 20);
const OFFICIAL = '+919000000013';
const CITIZEN = '+919000000001';

const post = async (path, body, token) => {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return response.json();
};

async function signIn(phone) {
  await post('/api/v1/auth/otp/send', { phone });
  const verified = await post('/api/v1/auth/otp/verify', { phone, code: OTP });
  return verified.data.accessToken;
}

const officialToken = await signIn(OFFICIAL);
const citizenToken = await signIn(CITIZEN);

const received = new Array(CLIENTS).fill(0);
const sockets = await Promise.all(
  Array.from({ length: CLIENTS }, (_, index) =>
    new Promise((resolve, reject) => {
      const socket = io(API, { transports: ['websocket'], auth: { token: officialToken }, reconnection: false });
      socket.on('incident:created', () => {
        received[index] += 1;
      });
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    }),
  ),
);
console.log(`${sockets.length} dashboard clients connected`);

const startedAt = Date.now();
for (let n = 0; n < EVENTS; n += 1) {
  await post(
    '/api/v1/incidents/sos',
    {
      clientUuid: randomUUID(),
      lat: 26.15 + Math.random() * 0.2,
      lon: 85.85 + Math.random() * 0.3,
      accuracyM: 20,
      reportedAt: new Date().toISOString(),
      type: 'FLOOD',
      peopleAffected: 2,
    },
    citizenToken,
  );
}
await new Promise((resolve) => setTimeout(resolve, 3_000));

const expected = CLIENTS * EVENTS;
const delivered = received.reduce((total, count) => total + count, 0);
const missed = received.filter((count) => count < EVENTS).length;
console.log(
  `O6: ${delivered}/${expected} events delivered (${((delivered / expected) * 100).toFixed(2)} %), ` +
    `${missed} clients short, ${EVENTS} events published in ${Date.now() - startedAt} ms`,
);

sockets.forEach((socket) => socket.disconnect());
process.exit(delivered / expected >= 0.99 ? 0 : 1);
