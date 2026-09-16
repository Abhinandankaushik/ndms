import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DomainEventBus, rooms } from '../../common/events/domain-event-bus';
import type { AuthUser } from '../auth/auth-user';
import { clampRecordedAt, isThrottled, type TeamPing } from './live-location';
import { LivePositionStore } from './live-position.store';
import type { TeamLocationInput } from './missions.schemas';
import { teamScope } from './scope';
import { TeamsRepository, type TeamLiveContext } from './teams.repository';
import { errorMessage, throttledWarning } from './throttled-warning';

// Each lost compare-and-set means another ping for the same team landed in between; a few
// rounds cover an offline backlog replayed in parallel, and anything beyond is dropped.
const MAX_WRITE_ATTEMPTS = 3;

@Injectable()
export class TeamLocationService {
  private readonly warn = throttledWarning(new Logger(TeamLocationService.name));

  constructor(
    private readonly teams: TeamsRepository,
    private readonly positions: LivePositionStore,
    private readonly events: DomainEventBus,
  ) {}

  // Live state only (CLAUDE.md rule 6): accepted pings go to Redis and reach Postgres through
  // the flusher's batches.
  async record(input: TeamLocationInput, user: AuthUser): Promise<{ accepted: boolean }> {
    const teamId = teamScope(user);
    const fix = { lat: input.lat, lon: input.lon, recordedAt: clampRecordedAt(new Date(input.recordedAt)) };
    let context: TeamLiveContext | undefined;

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const stored = await this.live(() => this.positions.read(teamId));
      if (stored.ping && isThrottled(stored.ping, fix)) return { accepted: false };

      context ??= await this.liveContext(teamId);
      const ping: TeamPing = {
        teamId,
        missionId: context.missionId,
        lat: fix.lat,
        lon: fix.lon,
        accuracyM: input.accuracyM ?? null,
        recordedAt: fix.recordedAt.toISOString(),
      };
      if (await this.live(() => this.positions.replace(stored, ping))) {
        this.publish(ping, context);
        return { accepted: true };
      }
    }
    return { accepted: false };
  }

  private async liveContext(teamId: string): Promise<TeamLiveContext> {
    const context = await this.teams.findLiveContext(teamId);
    if (!context) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: 'Team not found' });
    return context;
  }

  private publish(ping: TeamPing, context: TeamLiveContext): void {
    this.events.publish({
      name: 'team:location',
      rooms: [rooms.district(context.districtId), ...(context.incidentId ? [rooms.incident(context.incidentId)] : [])],
      payload: ping,
    });
  }

  private async live<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.warn(`Live team positions unavailable: ${errorMessage(error)}`);
      throw new ServiceUnavailableException({
        code: 'LIVE_LOCATION_UNAVAILABLE',
        message: 'Live location is temporarily unavailable; keep sending pings',
      });
    }
  }
}
