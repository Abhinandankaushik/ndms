import { apiFetch, type CallOptions } from '../client';
import type { DashboardSummary, HeatmapCell, HeatmapQuery, ResourceRow } from '../types';

export function getDashboardSummary(options?: CallOptions): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/dashboard/summary', options);
}

export function getIncidentHeatmap(query: HeatmapQuery, options?: CallOptions): Promise<HeatmapCell[]> {
  return apiFetch<HeatmapCell[]>('/dashboard/heatmap', {
    ...options,
    query: { bbox: query.bbox, hours: query.hours, cellDegrees: query.cellDegrees },
  });
}

export function getResourceOverview(options?: CallOptions): Promise<ResourceRow[]> {
  return apiFetch<ResourceRow[]>('/dashboard/resources', options);
}
