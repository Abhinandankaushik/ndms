import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import type { IncidentRecord, IncidentsRepository } from '../incidents/incidents.repository';

export function districtScope(user: AuthUser): number {
  if (user.districtId === null) {
    throw new ForbiddenException({ code: 'NO_DISTRICT_SCOPE', message: 'Your account is not assigned to a district' });
  }
  return user.districtId;
}

export function teamScope(user: AuthUser): string {
  if (user.rescueTeamId === null) {
    throw new ForbiddenException({ code: 'NO_TEAM_SCOPE', message: 'Your account is not assigned to a rescue team' });
  }
  return user.rescueTeamId;
}

// Stricter than IncidentsService.findVisible, which also admits the reporter: an official
// dispatches only inside their own district, even for an SOS they filed elsewhere themselves.
export async function findDistrictIncident(
  incidents: IncidentsRepository,
  incidentId: string,
  official: AuthUser,
): Promise<IncidentRecord> {
  const districtId = districtScope(official);
  const incident = await incidents.findById(incidentId);
  if (!incident || incident.districtId !== districtId) {
    throw new NotFoundException({ code: 'INCIDENT_NOT_FOUND', message: 'Incident not found' });
  }
  return incident;
}
