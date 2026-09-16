export type UtilisationBand = 'good' | 'warning' | 'critical';

export type PriorityBand = 'unscored' | 'low' | 'medium' | 'high' | 'critical';

// 85 % matches the API's facility:capacity_alert threshold, so a shelter turns red exactly when that alert fires.
const CRITICAL_UTILISATION = 0.85;
const WARNING_UTILISATION = 0.6;

export function utilisationBand(utilisation: number): UtilisationBand {
  if (utilisation >= CRITICAL_UTILISATION) return 'critical';
  if (utilisation >= WARNING_UTILISATION) return 'warning';
  return 'good';
}

export function utilisationLabel(utilisation: number): string {
  if (utilisation >= 1) return 'Full';
  if (utilisation >= CRITICAL_UTILISATION) return 'Near full';
  if (utilisation >= WARNING_UTILISATION) return 'Filling';
  return 'Space available';
}

// The worker's rule-based score tops out at 100; a lone SOS with no details lands around 40.
export function priorityBand(score: number | null): PriorityBand {
  if (score === null) return 'unscored';
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}
