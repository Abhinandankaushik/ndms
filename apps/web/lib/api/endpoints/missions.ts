import { apiFetch, type CallOptions } from '../client';
import type {
  CreateMissionInput,
  Mission,
  MissionDetail,
  MissionListQuery,
  MissionStatusChange,
  MissionWithIncident,
} from '../types';

const missionPath = (id: string) => `/missions/${encodeURIComponent(id)}`;

export function createMission(input: CreateMissionInput): Promise<Mission> {
  return apiFetch<Mission>('/missions', { method: 'POST', body: input });
}

export function listMissions(query: MissionListQuery = {}, options?: CallOptions): Promise<Mission[]> {
  return apiFetch<Mission[]>('/missions', {
    ...options,
    query: { status: query.status, incidentId: query.incidentId, limit: query.limit },
  });
}

export function listMyMissions(options?: CallOptions): Promise<MissionWithIncident[]> {
  return apiFetch<MissionWithIncident[]>('/missions/mine', options);
}

export function getMission(id: string, options?: CallOptions): Promise<MissionDetail> {
  return apiFetch<MissionDetail>(missionPath(id), options);
}

export function changeMissionStatus(id: string, change: MissionStatusChange): Promise<Mission> {
  return apiFetch<Mission>(`${missionPath(id)}/status`, { method: 'PATCH', body: change });
}
