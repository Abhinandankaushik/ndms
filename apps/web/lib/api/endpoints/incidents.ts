import { apiFetch, type CallOptions } from '../client';
import type {
  Incident,
  IncidentDetail,
  IncidentDetailsPatch,
  IncidentFlagInput,
  IncidentQueueQuery,
  IncidentStatusChange,
  MapMarker,
  MapMarkerQuery,
  ReportInput,
  ReportReceipt,
  Review,
  SosInput,
} from '../types';

const incidentPath = (id: string) => `/incidents/${encodeURIComponent(id)}`;

export function reportSos(input: SosInput): Promise<ReportReceipt> {
  return apiFetch<ReportReceipt>('/incidents/sos', { method: 'POST', body: input });
}

export function reportIncident(input: ReportInput): Promise<ReportReceipt> {
  return apiFetch<ReportReceipt>('/incidents', { method: 'POST', body: input });
}

export function listIncidentMarkers(query: MapMarkerQuery, options?: CallOptions): Promise<MapMarker[]> {
  return apiFetch<MapMarker[]>('/incidents', {
    ...options,
    query: { bbox: query.bbox, status: query.status, type: query.type, limit: query.limit },
  });
}

export function getIncidentQueue(query: IncidentQueueQuery = {}, options?: CallOptions): Promise<Incident[]> {
  return apiFetch<Incident[]>('/incidents/queue', {
    ...options,
    query: {
      status: query.status,
      type: query.type,
      sosOnly: query.sosOnly,
      limit: query.limit,
      offset: query.offset,
    },
  });
}

export function listMyIncidents(options?: CallOptions): Promise<Incident[]> {
  return apiFetch<Incident[]>('/incidents/mine', options);
}

export function getIncident(id: string, options?: CallOptions): Promise<IncidentDetail> {
  return apiFetch<IncidentDetail>(incidentPath(id), options);
}

export function updateIncidentDetails(id: string, patch: IncidentDetailsPatch): Promise<Incident> {
  return apiFetch<Incident>(incidentPath(id), { method: 'PATCH', body: patch });
}

export function changeIncidentStatus(id: string, change: IncidentStatusChange): Promise<Incident> {
  return apiFetch<Incident>(`${incidentPath(id)}/status`, { method: 'PATCH', body: change });
}

export function flagIncident(id: string, flag: IncidentFlagInput): Promise<Review> {
  return apiFetch<Review>(`${incidentPath(id)}/flags`, { method: 'POST', body: flag });
}
