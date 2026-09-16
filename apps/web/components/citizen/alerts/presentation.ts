import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { AlertSeverity } from '@/lib/api/types';

export interface SeverityStyle {
  icon: LucideIcon;
  card: string;
  badge: string;
  rank: number;
}

// Solid, high-contrast fills so severity reads at a glance in direct sunlight.
export const SEVERITY_STYLES: Record<AlertSeverity, SeverityStyle> = {
  EXTREME: {
    icon: OctagonAlert,
    card: 'border-red-800 bg-red-700 text-white',
    badge: 'border-white bg-white text-red-800',
    rank: 4,
  },
  SEVERE: {
    icon: TriangleAlert,
    card: 'border-red-700 bg-red-50 text-red-950',
    badge: 'border-red-700 bg-red-700 text-white',
    rank: 3,
  },
  MODERATE: {
    icon: TriangleAlert,
    card: 'border-amber-600 bg-amber-50 text-amber-950',
    badge: 'border-amber-700 bg-amber-600 text-white',
    rank: 2,
  },
  MINOR: {
    icon: Info,
    card: 'border-sky-700 bg-sky-50 text-sky-950',
    badge: 'border-sky-800 bg-sky-700 text-white',
    rank: 1,
  },
};

export function isUrgentSeverity(severity: AlertSeverity): boolean {
  return severity === 'SEVERE' || severity === 'EXTREME';
}
