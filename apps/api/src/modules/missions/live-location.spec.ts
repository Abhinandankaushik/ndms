import { randomUUID } from 'node:crypto';
import { clampRecordedAt, haversineMetres, isThrottled, parseTeamPing, type TeamPing } from './live-location';

const HOUR_MS = 3_600_000;
const ORIGIN = { lat: 26.1542, lon: 85.8918 };
const METRES_PER_DEGREE_LAT_ON_SPHERE = 111_195.08;

const northOf = (metres: number) => ({ lat: ORIGIN.lat + metres / METRES_PER_DEGREE_LAT_ON_SPHERE, lon: ORIGIN.lon });

describe('haversineMetres', () => {
  it('measures one degree of latitude on the mean-radius sphere', () => {
    expect(haversineMetres({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(METRES_PER_DEGREE_LAT_ON_SPHERE, 1);
  });

  it('is zero for the same point and symmetric', () => {
    const other = { lat: 25.5941, lon: 85.1376 };

    expect(haversineMetres(ORIGIN, ORIGIN)).toBe(0);
    expect(haversineMetres(ORIGIN, other)).toBeCloseTo(haversineMetres(other, ORIGIN), 6);
  });
});

describe('clampRecordedAt', () => {
  const now = new Date('2026-09-13T12:00:00.000Z');

  it.each([
    ['from the future', new Date(now.getTime() + HOUR_MS), now],
    ['more than a day old', new Date(now.getTime() - 72 * HOUR_MS), new Date(now.getTime() - 24 * HOUR_MS)],
    ['inside the window', new Date(now.getTime() - HOUR_MS), new Date(now.getTime() - HOUR_MS)],
  ] as const)('clamps a device time %s', (_case, recordedAt, expected) => {
    expect(clampRecordedAt(recordedAt, now)).toEqual(expected);
  });
});

describe('isThrottled', () => {
  const previousAt = new Date('2026-09-13T12:00:00.000Z');
  const previous: TeamPing = {
    teamId: randomUUID(),
    missionId: null,
    ...ORIGIN,
    accuracyM: 10,
    recordedAt: previousAt.toISOString(),
  };
  const after = (ms: number) => new Date(previousAt.getTime() + ms);

  it.each([
    ['under 5 s later, however far it moved', northOf(500), after(4_999), true],
    ['under 20 m away, however late', northOf(19), after(60_000), true],
    ['older than the stored position', northOf(500), after(-10_000), true],
    ['5 s later and 20 m away', northOf(20.5), after(5_000), false],
  ] as const)('%s: throttled is %s', (_case, position, recordedAt, throttled) => {
    expect(isThrottled(previous, { ...position, recordedAt })).toBe(throttled);
  });
});

describe('parseTeamPing', () => {
  it('reads back a stored ping', () => {
    const ping: TeamPing = { teamId: randomUUID(), missionId: randomUUID(), ...ORIGIN, accuracyM: null, recordedAt: new Date().toISOString() };

    expect(parseTeamPing(JSON.stringify(ping))).toEqual(ping);
  });

  it.each([
    ['a missing key', null],
    ['malformed JSON', '{"teamId":'],
    ['an out-of-range latitude', JSON.stringify({ teamId: randomUUID(), missionId: null, lat: 91, lon: 85, accuracyM: null, recordedAt: new Date().toISOString() })],
  ])('returns null for %s', (_case, raw) => {
    expect(parseTeamPing(raw)).toBeNull();
  });
});
