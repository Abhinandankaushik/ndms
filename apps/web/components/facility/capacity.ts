import type { FacilityKind } from '@/lib/api/types';

export const CAPACITY_WARNING_PERCENT = 70;
export const CAPACITY_ALERT_PERCENT = 85;

export interface Headcount {
  occupancy: number;
  capacity: number;
}

export interface CapacityFigures extends Headcount {
  freeCapacity: number;
  utilisation: number;
}

export type CapacityLevel = 'normal' | 'warning' | 'critical';

export function capacityFigures({ occupancy, capacity }: Headcount): CapacityFigures {
  return {
    occupancy,
    capacity,
    freeCapacity: capacity - occupancy,
    utilisation: capacity === 0 ? 0 : occupancy / capacity,
  };
}

export function clampOccupancy({ occupancy, capacity }: Headcount, delta: number): Headcount {
  return { occupancy: Math.max(0, Math.min(occupancy + delta, capacity)), capacity };
}

// Integer comparisons, like the API's alert check, so the bar turns red exactly when facility:capacity_alert fires.
export function capacityLevel({ occupancy, capacity }: Headcount): CapacityLevel {
  if (capacity <= 0) return 'normal';
  if (occupancy * 100 >= capacity * CAPACITY_ALERT_PERCENT) return 'critical';
  if (occupancy * 100 >= capacity * CAPACITY_WARNING_PERCENT) return 'warning';
  return 'normal';
}

// Rounded down so 84.6 % never reads as 85 % while the bar is still amber.
export function utilisationPercent({ occupancy, capacity }: Headcount): number {
  return capacity > 0 ? Math.floor((occupancy * 100) / capacity) : 0;
}

export function isLowStock(quantity: number, lowStockThreshold: number | null): boolean {
  return lowStockThreshold !== null && quantity <= lowStockThreshold;
}

export const OCCUPANCY_WORDING: Record<FacilityKind, { heading: string; occupant: [string, string]; free: [string, string] }> = {
  SHELTER: { heading: 'People sheltered', occupant: ['person', 'people'], free: ['space free', 'spaces free'] },
  HOSPITAL: { heading: 'Beds occupied', occupant: ['patient', 'patients'], free: ['bed free', 'beds free'] },
};
