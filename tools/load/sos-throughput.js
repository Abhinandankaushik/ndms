// Criterion O7: sustain 50 incidents/s for 5 minutes, and O1's server half (SOS latency).
// Run with the stack up:
//   docker run --rm -i grafana/k6 run - < tools/load/sos-throughput.js
// Override with -e BASE_URL=... when the API is not on the Docker host.
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3000';
const OTP_CODE = __ENV.OTP_DEV_CODE || '123456';
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '5m';
const PHONES = ['+919000000001', '+919000000002', '+919000000003'];

const sosLatency = new Trend('sos_latency_ms', true);

export const options = {
  scenarios: {
    sos: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    // The SOS path must stay fast and must not shed load (CLAUDE.md rule 1).
    'http_req_failed{scenario:sos}': ['rate<0.01'],
    sos_latency_ms: ['p(95)<300'],
  },
};

export function setup() {
  const json = { headers: { 'Content-Type': 'application/json' } };
  return {
    tokens: PHONES.map((phone) => {
      http.post(`${BASE_URL}/api/v1/auth/otp/send`, JSON.stringify({ phone }), json);
      const verified = http.post(
        `${BASE_URL}/api/v1/auth/otp/verify`,
        JSON.stringify({ phone, code: OTP_CODE }),
        json,
      );
      return verified.json('data.accessToken');
    }),
  };
}

export default function (data) {
  const token = data.tokens[__VU % data.tokens.length];
  // Darbhanga's bounding box, so every report lands in the seeded district.
  const lat = 25.87 + Math.random() * 0.58;
  const lon = 85.67 + Math.random() * 0.73;

  const response = http.post(
    `${BASE_URL}/api/v1/incidents/sos`,
    JSON.stringify({
      clientUuid: uuidv4(),
      lat,
      lon,
      accuracyM: 20,
      reportedAt: new Date().toISOString(),
      type: 'FLOOD',
      peopleAffected: 1 + (__ITER % 5),
    }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  );

  sosLatency.add(response.timings.duration);
  check(response, { 'sos accepted': (r) => r.status === 201 || r.status === 200 });
}
