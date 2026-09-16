import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { IncidentsRepository } from '../incidents/incidents.repository';
import type { TeamPing } from './live-location';
import { LivePositionStore } from './live-position.store';
import type { NearestTeamsQueryInput } from './missions.schemas';
import { districtScope, findDistrictIncident } from './scope';
import { TeamsRepository, type NearbyTeam, type TeamRecord } from './teams.repository';
import { errorMessage, throttledWarning } from './throttled-warning';

function withLivePosition(team: TeamRecord, live: TeamPing | undefined): TeamRecord {
  if (!live) return team;
  const liveAt = new Date(live.recordedAt);
  if (team.locationUpdatedAt && team.locationUpdatedAt >= liveAt) return team;
  return { ...team, lat: live.lat, lon: live.lon, locationUpdatedAt: liveAt };
}

@Injectable()
export class TeamsService {
  private readonly warn = throttledWarning(new Logger(TeamsService.name));

  constructor(
    private readonly teams: TeamsRepository,
    private readonly incidents: IncidentsRepository,
    private readonly positions: LivePositionStore,
  ) {}

  async list(official: AuthUser): Promise<TeamRecord[]> {
    const teams = await this.teams.listByDistrict(districtScope(official));
    const live = await this.livePositions(teams.map((team) => team.id));
    return teams.map((team) => withLivePosition(team, live.get(team.id)));
  }

  async nearest(query: NearestTeamsQueryInput, official: AuthUser): Promise<NearbyTeam[]> {
    const incident = await findDistrictIncident(this.incidents, query.incidentId, official);
    if (incident.lat === null || incident.lon === null) {
      throw new UnprocessableEntityException({
        code: 'INCIDENT_HAS_NO_LOCATION',
        message: 'This incident has no location yet; pin it on the map before finding teams',
      });
    }
    return this.teams.findNearestAvailable({
      districtId: incident.districtId,
      point: { lat: incident.lat, lon: incident.lon },
      capability: query.capability ?? null,
      limit: query.limit,
    });
  }

  // Live positions only sharpen the list: without Redis the last flushed position still answers.
  private async livePositions(teamIds: string[]): Promise<Map<string, TeamPing>> {
    try {
      return await this.positions.readMany(teamIds);
    } catch (error) {
      this.warn(`Serving team positions without live overlay: ${errorMessage(error)}`);
      return new Map();
    }
  }
}
