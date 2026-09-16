import { DISASTER_TYPES } from './contract';
import { scoreIncident, type PriorityInput } from './priority';

const plainFloodReport: PriorityInput = {
  type: 'FLOOD',
  peopleAffected: 1,
  hasElderly: false,
  hasChildren: false,
  hasInjured: false,
  isSos: false,
  minutesWaiting: 0,
};

describe('scoreIncident', () => {
  it('scores a worked example exactly as the documented weights add up', () => {
    const result = scoreIncident({
      type: 'FIRE',
      peopleAffected: 3,
      hasElderly: false,
      hasChildren: true,
      hasInjured: true,
      isSos: true,
      minutesWaiting: 30,
    });

    // fire 26 + three people 8 + injured 12 + children 7 + SOS 15 = 68 harm, + 30 min waiting 2.5
    expect(result).toEqual({ priorityScore: 70.5, severityLevel: 4 });
  });

  it.each([
    ['injured people', { hasInjured: true }],
    ['children', { hasChildren: true }],
    ['elderly people', { hasElderly: true }],
  ])('ranks a report with %s above a plain report of the same flood', (_case, vulnerability) => {
    const plain = scoreIncident(plainFloodReport);
    const vulnerable = scoreIncident({ ...plainFloodReport, ...vulnerability });

    expect(vulnerable.priorityScore).toBeGreaterThan(plain.priorityScore);
    expect(vulnerable.severityLevel).toBeGreaterThanOrEqual(plain.severityLevel);
  });

  it('ranks injury above children, and children above elderly people', () => {
    const injured = scoreIncident({ ...plainFloodReport, hasInjured: true }).priorityScore;
    const children = scoreIncident({ ...plainFloodReport, hasChildren: true }).priorityScore;
    const elderly = scoreIncident({ ...plainFloodReport, hasElderly: true }).priorityScore;

    expect(injured).toBeGreaterThan(children);
    expect(children).toBeGreaterThan(elderly);
  });

  it('adds a fixed 15-point bonus for an SOS', () => {
    const report = scoreIncident(plainFloodReport);
    const sos = scoreIncident({ ...plainFloodReport, isSos: true });

    expect(sos.priorityScore - report.priorityScore).toBeCloseTo(15, 5);
  });

  it('ranks hazards that trap people above slower-onset ones', () => {
    const [collapse, flood, other] = (['BUILDING_COLLAPSE', 'FLOOD', 'OTHER'] as const).map(
      (type) => scoreIncident({ ...plainFloodReport, type }).priorityScore,
    );

    expect(collapse).toBeGreaterThan(flood!);
    expect(flood).toBeGreaterThan(other!);
  });

  it('gives more people more points, with each doubling worth the same', () => {
    const points = (peopleAffected: number) => scoreIncident({ ...plainFloodReport, peopleAffected }).priorityScore;

    expect(points(3) - points(1)).toBeCloseTo(points(7) - points(3), 1);
    expect(points(500)).toBe(points(5_000));
  });

  it('raises priority, but not severity, for a report that waited two hours offline', () => {
    const live = scoreIncident(plainFloodReport);
    const heldOffline = scoreIncident({ ...plainFloodReport, minutesWaiting: 120 });

    expect(heldOffline.priorityScore).toBeCloseTo(live.priorityScore + 10, 5);
    expect(heldOffline.severityLevel).toBe(live.severityLevel);
  });

  it('caps the score at 100 and severity at 5 however extreme the report', () => {
    const worst = scoreIncident({
      type: 'BUILDING_COLLAPSE',
      peopleAffected: 1_000_000,
      hasElderly: true,
      hasChildren: true,
      hasInjured: true,
      isSos: true,
      minutesWaiting: 1_000_000,
    });

    expect(worst).toEqual({ priorityScore: 100, severityLevel: 5 });
  });

  it('never scores below 0 or severity below 1, even for nonsense inputs', () => {
    const empty = scoreIncident({ ...plainFloodReport, type: 'OTHER', peopleAffected: -4, minutesWaiting: -90 });
    const garbage = scoreIncident({ ...plainFloodReport, peopleAffected: Number.NaN, minutesWaiting: Number.NaN });

    expect(empty).toEqual({ priorityScore: 14, severityLevel: 1 });
    expect(garbage.priorityScore).toBe(scoreIncident({ ...plainFloodReport, peopleAffected: 0 }).priorityScore);
  });

  it.each(DISASTER_TYPES)('keeps a %s report within bounds with at most two decimals', (type) => {
    const { priorityScore, severityLevel } = scoreIncident({ ...plainFloodReport, type, peopleAffected: 6, minutesWaiting: 7 });

    expect(priorityScore).toBeGreaterThanOrEqual(0);
    expect(priorityScore).toBeLessThanOrEqual(100);
    expect(priorityScore).toBe(Math.round(priorityScore * 100) / 100);
    expect(severityLevel).toBeGreaterThanOrEqual(1);
    expect(severityLevel).toBeLessThanOrEqual(5);
  });
});
