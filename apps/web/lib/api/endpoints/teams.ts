import { apiFetch, type CallOptions } from '../client';
import type { NearbyTeam, NearestTeamsQuery, Team, TeamLocationPing, TeamLocationReceipt } from '../types';

export function listTeams(options?: CallOptions): Promise<Team[]> {
  return apiFetch<Team[]>('/teams', options);
}

export function findNearestTeams(query: NearestTeamsQuery, options?: CallOptions): Promise<NearbyTeam[]> {
  return apiFetch<NearbyTeam[]>('/teams/nearest', {
    ...options,
    query: { incidentId: query.incidentId, capability: query.capability, limit: query.limit },
  });
}

export function sendTeamLocation(ping: TeamLocationPing): Promise<TeamLocationReceipt> {
  return apiFetch<TeamLocationReceipt>('/teams/me/location', { method: 'POST', body: ping });
}
