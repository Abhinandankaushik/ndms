import { apiFetch, type CallOptions } from '../client';
import type { ActiveAlertsQuery, Alert, CreateAlertInput } from '../types';

export function createAlert(input: CreateAlertInput): Promise<Alert> {
  return apiFetch<Alert>('/alerts', { method: 'POST', body: input });
}

export function listAlerts(options?: CallOptions): Promise<Alert[]> {
  return apiFetch<Alert[]>('/alerts', options);
}

export function listActiveAlerts(query: ActiveAlertsQuery = {}, options?: CallOptions): Promise<Alert[]> {
  return apiFetch<Alert[]>('/alerts/active', { ...options, query: { lat: query.lat, lon: query.lon } });
}

export function cancelAlert(id: string): Promise<Alert> {
  return apiFetch<Alert>(`/alerts/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}
