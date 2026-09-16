import { capacityFigures, crossedAlertLevel } from './facility-capacity';

describe('capacityFigures', () => {
  it('derives free capacity and utilisation from the headcount', () => {
    expect(capacityFigures({ occupancy: 425, capacity: 500 })).toEqual({
      occupancy: 425,
      capacity: 500,
      freeCapacity: 75,
      utilisation: 0.85,
    });
  });

  it('reports a zero-capacity facility as empty rather than NaN', () => {
    expect(capacityFigures({ occupancy: 0, capacity: 0 })).toEqual({
      occupancy: 0,
      capacity: 0,
      freeCapacity: 0,
      utilisation: 0,
    });
  });
});

describe('crossedAlertLevel', () => {
  it.each([
    ['rising from 84 % to exactly 85 %', { occupancy: 84, capacity: 100 }, { occupancy: 85, capacity: 100 }],
    ['jumping from empty to full', { occupancy: 0, capacity: 100 }, { occupancy: 100, capacity: 100 }],
    ['reaching exactly 17 of 20', { occupancy: 16, capacity: 20 }, { occupancy: 17, capacity: 20 }],
    ['reaching 8,500 of 10,000 from 8,499', { occupancy: 8_499, capacity: 10_000 }, { occupancy: 8_500, capacity: 10_000 }],
    ['a capacity cut from 45 % to 90 %', { occupancy: 90, capacity: 200 }, { occupancy: 90, capacity: 100 }],
  ])('fires when %s', (_case, before, after) => {
    expect(crossedAlertLevel(before, after)).toBe(true);
  });

  it.each([
    ['staying below 85 %', { occupancy: 10, capacity: 100 }, { occupancy: 84, capacity: 100 }],
    ['rising while already above', { occupancy: 85, capacity: 100 }, { occupancy: 90, capacity: 100 }],
    ['falling back below', { occupancy: 90, capacity: 100 }, { occupancy: 84, capacity: 100 }],
    ['staying full at capacity', { occupancy: 100, capacity: 100 }, { occupancy: 100, capacity: 100 }],
    ['a zero-capacity facility', { occupancy: 0, capacity: 0 }, { occupancy: 0, capacity: 0 }],
  ])('stays quiet when %s', (_case, before, after) => {
    expect(crossedAlertLevel(before, after)).toBe(false);
  });
});
