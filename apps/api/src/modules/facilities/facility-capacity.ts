export const CAPACITY_ALERT_PERCENT = 85;

export interface Headcount {
  occupancy: number;
  capacity: number;
}

export interface CapacityFigures extends Headcount {
  freeCapacity: number;
  utilisation: number;
}

// A zero-capacity facility can hold nobody (the table CHECK pins its occupancy to 0), so it
// reports 0 rather than NaN and never sorts as the most utilised.
export function capacityFigures({ occupancy, capacity }: Headcount): CapacityFigures {
  return {
    occupancy,
    capacity,
    freeCapacity: capacity - occupancy,
    utilisation: capacity === 0 ? 0 : occupancy / capacity,
  };
}

// Integer arithmetic, so a shelter at exactly 85 % counts as reaching the threshold whatever
// the floating-point quotient rounds to.
const atAlertLevel = ({ occupancy, capacity }: Headcount) =>
  capacity > 0 && occupancy * 100 >= capacity * CAPACITY_ALERT_PERCENT;

export function crossedAlertLevel(before: Headcount, after: Headcount): boolean {
  return !atAlertLevel(before) && atAlertLevel(after);
}
