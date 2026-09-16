// One hue, light to dark (a sequential scale). Warm rather than the usual blue because the OSM basemap already uses
// blue for rivers and ponds, which cover much of a flood district.
export const HEATMAP_RAMP = ['#fbd0b0', '#f6ad80', '#f08a54', '#e4632f', '#bf4a1c', '#8a3312'] as const;

export const HEATMAP_FILL_OPACITY = 0.6;

export const HEATMAP_WINDOWS_HOURS = [6, 24, 72, 168] as const;
export type HeatmapWindowHours = (typeof HEATMAP_WINDOWS_HOURS)[number];

// Square-root scaling keeps single reports visible next to a hotspot of dozens.
export function heatmapColor(count: number, maxCount: number): string {
  const ratio = maxCount > 0 ? Math.sqrt(Math.min(count, maxCount) / maxCount) : 0;
  const index = Math.min(HEATMAP_RAMP.length - 1, Math.floor(ratio * HEATMAP_RAMP.length));
  return HEATMAP_RAMP[index] ?? HEATMAP_RAMP[0];
}

// Cells stay roughly 16 px across at every zoom around Bihar's latitude; the API accepts 0.001 to 0.1 degrees.
export function heatmapCellDegrees(zoom: number): number {
  if (zoom <= 9) return 0.05;
  if (zoom <= 10) return 0.02;
  if (zoom <= 11) return 0.01;
  if (zoom <= 12) return 0.005;
  if (zoom <= 13) return 0.0025;
  return 0.001;
}

export function cellSizeLabel(cellDegrees: number): string {
  const meters = cellDegrees * 111_000;
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(meters >= 10_000 ? 0 : 1)} km` : `${Math.round(meters / 10) * 10} m`;
}
