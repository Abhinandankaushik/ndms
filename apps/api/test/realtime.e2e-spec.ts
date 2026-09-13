import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { DOMAIN_EVENTS_CHANNEL } from '../src/modules/realtime/redis-events.bridge';
import { loginAs, type LoggedIn } from './support/auth';
import { createTestApp, startStack, stopStack, type TestApp, type TestStack } from './support/test-app';

const DARBHANGA_TOWN = { lat: 26.1542, lon: 85.8918 };

describe('realtime gateway', () => {
  let stack: TestStack;
  let t: TestApp;
  let citizen: LoggedIn;
  let official: LoggedIn;
  const sockets: Socket[] = [];

  const connect = (token: string | undefined) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(t.baseUrl, { transports: ['websocket'], auth: token ? { token } : {}, reconnection: false });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });

  const nextEvent = <T>(socket: Socket, name: string, match: (payload: T) => boolean, timeoutMs = 3_000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no ${name} within ${timeoutMs} ms`)), timeoutMs);
      const handler = (payload: T) => {
        if (!match(payload)) return;
        clearTimeout(timer);
        socket.off(name, handler);
        resolve(payload);
      };
      socket.on(name, handler);
    });

  const sos = () =>
    t
      .http()
      .post('/api/v1/incidents/sos')
      .set(citizen.auth)
      .send({ clientUuid: randomUUID(), ...DARBHANGA_TOWN, accuracyM: 12, reportedAt: new Date().toISOString() })
      .expect(201);

  beforeAll(async () => {
    stack = await startStack();
    t = await createTestApp(stack);
    citizen = await loginAs(t);
    official = await loginAs(t, { role: 'GOVT_OFFICIAL' });
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await t?.close();
    await stopStack(stack);
  });

  it('pushes incident:created to district officials well inside a second', async () => {
    const socket = await connect(official.accessToken);
    const arrivals = new Map<string, { receivedAt: number; payload: { lat: number; isSos: boolean } }>();
    socket.on('incident:created', (payload: { id: string; lat: number; isSos: boolean }) =>
      arrivals.set(payload.id, { receivedAt: Date.now(), payload }),
    );

    const sent = Date.now();
    const created = await sos();
    for (let waited = 0; waited < 3_000 && !arrivals.has(created.body.data.id); waited += 25) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const arrival = arrivals.get(created.body.data.id);
    expect(arrival?.payload).toMatchObject({ lat: DARBHANGA_TOWN.lat, isSos: true });
    expect(arrival!.receivedAt - sent).toBeLessThan(1_000);
  });

  it('does not push district events to citizens', async () => {
    const socket = await connect(citizen.accessToken);
    const received: unknown[] = [];
    socket.on('incident:created', (payload) => received.push(payload));

    await sos();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(received).toEqual([]);
  });

  it.each([
    ['no token', undefined, 'AUTH_REQUIRED'],
    ['an invalid token', 'not-a-jwt', 'TOKEN_INVALID'],
  ])('refuses a connection with %s', async (_case, token, message) => {
    await expect(connect(token)).rejects.toMatchObject({ message });
  });

  it('lets the reporter follow their incident and see the status change', async () => {
    const socket = await connect(citizen.accessToken);
    const created = await sos();

    const ack = await socket.emitWithAck('incident:subscribe', { incidentId: created.body.data.id });
    expect(ack).toEqual({ ok: true });

    const change = nextEvent<{ id: string; to: string }>(socket, 'incident:status_changed', (payload) => payload.id === created.body.data.id);
    await t
      .http()
      .patch(`/api/v1/incidents/${created.body.data.id}/status`)
      .set(official.auth)
      .send({ status: 'VERIFIED' })
      .expect(200);

    await expect(change).resolves.toMatchObject({ to: 'VERIFIED' });
  });

  it("refuses to subscribe a citizen to someone else's incident", async () => {
    const other = await loginAs(t);
    const socket = await connect(other.accessToken);
    const created = await sos();

    const ack = await socket.emitWithAck('incident:subscribe', { incidentId: created.body.data.id });

    expect(ack).toEqual({ ok: false, error: 'INCIDENT_NOT_FOUND' });
  });

  it('relays events that other processes publish on Redis', async () => {
    const socket = await connect(official.accessToken);
    const publisher = new Redis(t.env.REDIS_URL);
    const marker = randomUUID();

    try {
      const relayed = nextEvent<{ marker: string }>(socket, 'incident:enriched', (payload) => payload.marker === marker);
      await publisher.publish(
        DOMAIN_EVENTS_CHANNEL,
        JSON.stringify({ name: 'incident:enriched', rooms: [`district:${t.districtId}`], payload: { marker } }),
      );

      await expect(relayed).resolves.toEqual({ marker });
    } finally {
      publisher.disconnect();
    }
  });
});
